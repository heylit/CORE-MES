import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { gecersiz } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { satinAlmaIsi } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import { baglantiHatasiniTemizle, sonBaglantiHatasi } from './yardimci-baglanti.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { gidenIzleme, gidenYenidenGonder, malzemeEslemesiYaz, malzemeTuru, satinAlmaTuru, yeniSurecBellegi } from './servis.ts';
import type {
  LogoyaBekletmeGidecekSiparis, LogoyaGidecekKarsilama, LogoyaGidecekSiparis, LogoyaGuncellemeGidecekSiparis, LogoyaGuncellemeGidecekMalzeme, SatinAlmaKaynagi, SatirBaglari,
  SatinAlmaTurOrtami, SiparisLogoSonucu, Tamam, TurOrtami, TurSonucu, TxAcan,
} from './servis.ts';
import type { GonderilecekTalep } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const TEST_ISTEK_SURESI_MS = 5000;
const ZAMAN_ASIMI_SURESI_MS = 300;

// Satın almanın disari.ts işlevleri gelene kadar kaynak test içinde tutulur (UYUM-BORCU "bağlamada kapanacak"). Kural: sonucu alan belge
// kuyruktan çıkar; "hata" alan kuyrukta kalır; reddet doluyken sonuç yazımı satın alma kuralı gibi reddedilir.
type Durum = { durum: 'bekliyor' | 'gonderildi' | 'hata'; hata: string | null };
interface SahteKaynak extends SatinAlmaKaynagi {
  siparisler: Map<number, LogoyaGidecekSiparis & { kayitNo: string | null; satirRefleri: SatirBaglari | null; hata: string | null }>;
  guncellemeler: Map<number, LogoyaGuncellemeGidecekSiparis & Durum & { baglar: SatirBaglari | null }>;
  kapatmalar: Map<number, { no: string; logoKayitNo: string; satirRefleri: string[] } & Durum>;
  bekletmeler: Map<number, LogoyaBekletmeGidecekSiparis & Durum>;
  iptaller: Map<number, { no: string; logoKayitNo: string } & Durum>;
  talepler: Map<number, GonderilecekTalep & { kayitNo: string | null; satirRefleri: SatirBaglari | null; hata: string | null }>;
  karsilamalar: Map<number, LogoyaGidecekKarsilama & Durum & { ref: string | null }>;
  reddet: boolean;
}

function sahteKaynak(): SahteKaynak {
  const durumYaz = (d: Durum | undefined, sonuc: Tamam | { hata: string } | object): void => {
    if (!d) throw gecersiz('Belge yok.');
    if ('hata' in sonuc) { d.durum = 'hata'; d.hata = sonuc.hata; } else { d.durum = 'gonderildi'; d.hata = null; }
  };
  const bekleyen = <T extends Durum>(m: Map<number, T>, sinir: number): [number, T][] =>
    [...m.entries()].filter(([, x]) => x.durum !== 'gonderildi').slice(0, sinir);
  const k: SahteKaynak = {
    siparisler: new Map(),
    guncellemeler: new Map(),
    kapatmalar: new Map(),
    bekletmeler: new Map(),
    iptaller: new Map(),
    talepler: new Map(),
    karsilamalar: new Map(),
    reddet: false,
    async gidecekler(_db: Db, sinir: number) {
      return [...k.siparisler.values()].filter((s) => s.kayitNo === null).slice(0, sinir);
    },
    async sonuc(_db: Db, id: number, sonuc: SiparisLogoSonucu) {
      if (k.reddet) throw gecersiz('Sipariş bu arada değişti.');
      const s = k.siparisler.get(id);
      if (!s) throw gecersiz('Sipariş yok.');
      if ('hata' in sonuc) { s.durum = 'hata'; s.hata = sonuc.hata; return; }
      s.kayitNo = sonuc.kayitNo;
      s.satirRefleri = sonuc.satirlar;
      s.hata = null;
    },
    async guncellemeGidecekler(_db: Db, sinir: number) {
      return bekleyen(k.guncellemeler, sinir).map(([, x]) => x);
    },
    async guncellemeSonucu(_db: Db, id: number, sonuc: { satirlar: SatirBaglari } | { hata: string }) {
      const g = k.guncellemeler.get(id);
      durumYaz(g, sonuc);
      if (g && 'satirlar' in sonuc) g.baglar = sonuc.satirlar;
    },
    async kapatmaGidecekler(_db: Db, sinir: number) {
      return bekleyen(k.kapatmalar, sinir).map(([id, x]) => ({ id, no: x.no, logoKayitNo: x.logoKayitNo, satirRefleri: x.satirRefleri }));
    },
    async kapatmaSonucu(_db: Db, id: number, sonuc: Tamam) { durumYaz(k.kapatmalar.get(id), sonuc); },
    async bekletmeGidecekler(_db: Db, sinir: number) {
      return bekleyen(k.bekletmeler, sinir).map(([, x]) => x);
    },
    async bekletmeSonucu(_db: Db, id: number, istek: 'beklet' | 'serbest', sonuc: Tamam) {
      const x = k.bekletmeler.get(id);
      if (x?.istek !== istek) throw gecersiz('İstek değişti.');
      durumYaz(x, sonuc);
    },
    async iptalGidecekler(_db: Db, sinir: number) {
      return bekleyen(k.iptaller, sinir).map(([id, i]) => ({ id, no: i.no, logoKayitNo: i.logoKayitNo }));
    },
    async iptalSonucu(_db: Db, id: number, sonuc: Tamam) { durumYaz(k.iptaller.get(id), sonuc); },
    async talepGidecekler(_db: Db, sinir: number) {
      return [...k.talepler.values()].filter((t) => t.kayitNo === null).slice(0, sinir);
    },
    async talepSonucu(_db: Db, id: number, sonuc: SiparisLogoSonucu) {
      const t = k.talepler.get(id);
      if (!t) throw gecersiz('Talep yok.');
      if ('hata' in sonuc) { t.hata = sonuc.hata; return; }
      t.kayitNo = sonuc.kayitNo;
      t.satirRefleri = sonuc.satirlar;
      t.hata = null;
    },
    async karsilamaGidecekler(_db: Db, sinir: number) {
      return bekleyen(k.karsilamalar, sinir).map(([, x]) => x);
    },
    async karsilamaSonucu(_db: Db, id: number, sonuc: { karsilamaRef: string } | { hata: string }) {
      const x = k.karsilamalar.get(id);
      durumYaz(x, sonuc);
      if (x && 'karsilamaRef' in sonuc) x.ref = sonuc.karsilamaRef;
    },
  };
  return k;
}

interface Giden { niyet: boolean; deneme_sayisi: number; son_sonuc: string | null; son_hata: string | null; logo_kayit_no: string | null }

describe('Logo satın alma gönderimi (sipariş, talep, karşılama), sahte köprü ve sahte kaynakla (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kopru: SahteKopru;
  let kaynak: SahteKaynak;
  let firmaId = 0;
  let yoneticiId = 0;
  let firmaSayac = 0;
  let siparisSayac = 0;
  let simdi = Date.parse('2026-10-12T10:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function tamam<T>(yol: string, govde: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  const ayar = (anahtar: string, deger: boolean) => tamam(`/ayarlar/${anahtar}/degistir`, { deger });
  async function firma(logoCariKodu: string | null): Promise<number> {
    const r = await tamam<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: `Logo deneme firma ${++firmaSayac}`, tur: 'tedarikci', logoCariKodu });
    return r.firma.id;
  }
  function siparisEkle(ek: Partial<LogoyaGidecekSiparis> = {}): LogoyaGidecekSiparis {
    const id = ++siparisSayac;
    const s: LogoyaGidecekSiparis = {
      id, no: `SP-2026-${String(id).padStart(3, '0')}`, tarih: '2026-10-12', firmaId, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: null,
      durum: 'bekliyor',
      satirlar: [
        { satirId: id * 10 + 1, stokKodu: 'HM-DEN-00001', hizmet: false, miktar: '5', birim: 'kg', birimFiyat: '40' },
        { satirId: id * 10 + 2, stokKodu: 'HM-DEN-00002', hizmet: false, miktar: '2', birim: 'adet', birimFiyat: '15.5' },
      ],
      ...ek,
    };
    kaynak.siparisler.set(id, { ...s, kayitNo: null, satirRefleri: null, hata: null });
    return s;
  }
  const ortami = (bellek = yeniSurecBellegi(), sureMs = TEST_ISTEK_SURESI_MS): SatinAlmaTurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs }), bellek, saat: () => new Date(simdi), kaynak,
  });
  const tur = (o: SatinAlmaTurOrtami): Promise<TurSonucu> => satinAlmaTuru(vt(), o);
  const giden = (tur_: string, no: number): Promise<Giden | null> => vt().tek<Giden>(
    `SELECT niyet_zamani IS NOT NULL AS niyet, deneme_sayisi, son_sonuc, son_hata, logo_kayit_no FROM logo_giden WHERE belge_turu = $1 AND belge_no = $2`, [tur_, no]);
  const ekleIstekleri = (): number => kopru.istekler.filter((i) => i.yol === '/api/PurchaseOrder/AddRich').length;
  const bekle = (ms: number) => new Promise((coz) => setTimeout(coz, ms));

  before(async () => {
    ortam = await testVeritabaniKur('logosip');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo', kullaniciAdi: 'ls-yonetici', parola: PAROLA }));
    // 3313: satır kartları Logo'da bilinir (okunmuş kopya); kart bekleyen belge ayrı testte.
    await vt().sorgu(`INSERT INTO logo_malzeme_karti (logical_ref, kod, aktif, son_okuma)
      SELECT 880000 + n, k, true, now() FROM unnest($1::text[]) WITH ORDINALITY AS t (k, n)`,
      [['HM-DEN-00001', 'HM-DEN-00002', 'HM-DEN-00003', 'HM-DEN-00009', 'HZ-FSN-00001', 'MM-DEN-00001', 'MM-DEN-00002', 'LG.DEN.2']]);
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ls-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
    await ayar('logo.satin-alma-gonderimi', true);
    firmaId = await firma('C-DENEME-01');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kopru.cariler.add('C-DENEME-01');
    kaynak = sahteKaynak();
    simdi += 24 * 3600_000;
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LGS-7 kapalı: "Logo bağlantısı" ya da "satın alma gönderimi" kapalıyken istek ve yazma yok; iş "bekliyor" döner', async () => {
    const s = siparisEkle();
    await ayar('logo.satin-alma-gonderimi', false);
    try {
      assert.deepEqual(await tur(ortami()), { tur: 'satin-alma-kapali' });
      assert.equal(await isiBirKezCalistir(vt(), satinAlmaIsi(kaynak)), 'bekliyor');
      await ayar('logo.baglanti', false);
      assert.deepEqual(await tur(ortami()), { tur: 'kapali' });
    } finally {
      await ayar('logo.baglanti', true);
      await ayar('logo.satin-alma-gonderimi', true);
    }
    assert.deepEqual(await tur({ ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.equal(kopru.istekler.length, 0);
    assert.equal(await giden('siparis', s.id), null);
  });

  test('LGS-8 kabul: niyet, sonra numarayla bulma, cari denetimi ve açma; satır kayıt numaraları TMI satırlarına yazılır', async () => {
    const s = siparisEkle({ iskontoYuzdesi: '10' });
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id });
    assert.equal(kopru.istekler.length, 0, 'niyet turunda istek yok');
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), [
      `GET /api/PurchaseOrder/find/${s.no}`, 'GET /api/Arp/find/C-DENEME-01', 'POST /api/PurchaseOrder/AddRich',
    ]);
    assert.deepEqual(kopru.istekler[2]?.govde, {
      number: s.no, date: '12.10.2026', arpCode: 'C-DENEME-01', orderStatus: 4,
      lines: [
        { type: 0, masterCode: 'HM-DEN-00001', quantity: 5, price: 36, unitCode: 'KG', vatRate: 20, description: '(isk. %10)' },
        { type: 0, masterCode: 'HM-DEN-00002', quantity: 2, price: 13.95, unitCode: 'ADET', vatRate: 20, description: '(isk. %10)' },
      ],
    });
    const logo = kopru.siparisler.get(s.no)!;
    const t = kaynak.siparisler.get(s.id)!;
    assert.equal(t.kayitNo, String(logo.ref));
    assert.deepEqual(t.satirRefleri, s.satirlar.map((x, i) => ({ satirId: x.satirId, logoSatirRef: String(logo.satirlar[i]) })));
    const g = await giden('siparis', s.id);
    assert.equal(g?.son_sonuc, 'gonderildi');
    assert.equal(g?.logo_kayit_no, String(logo.ref));
    assert.equal(g?.niyet, false);
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, 'gönderilen sipariş kuyruktan çıkar');
    // Fatura okuması siparişi numarasıyla arar: numara Logo'da açılırken yazılır.
    assert.equal((await vt().tek<{ siparis_no: string }>('SELECT siparis_no FROM logo_siparis_no WHERE belge_no = $1', [s.id]))?.siparis_no, s.no);
  });

  test('LGS-9 kalkan: Logo\'da aynı numaralı sipariş varsa yenisi açılmaz; satırları okunup bağlanır ("zaten-vardi")', async () => {
    const s = siparisEkle();
    kopru.siparisler.set(s.no, { ref: 555, satirlar: [601, 602] });
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'zaten-vardi' });
    assert.equal(ekleIstekleri(), 0);
    assert.deepEqual(kaynak.siparisler.get(s.id)?.satirRefleri?.map((x) => x.logoSatirRef), ['601', '602']);
    assert.equal(kaynak.siparisler.get(s.id)?.kayitNo, '555');
  });

  test('LGS-10 (ret): cari kodu Logo\'da yoksa açma isteği gitmez, sipariş "hata"; finansta cari kodu yoksa hiç istek gitmez', async () => {
    const yok = siparisEkle({ firmaId: await firma('C-LOGODA-YOK') });
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: yok.id, sonuc: 'reddedildi' });
    assert.equal(ekleIstekleri(), 0);
    assert.equal(kaynak.siparisler.get(yok.id)?.hata, "Cari kodu C-LOGODA-YOK Logo'da yok.");
    assert.equal((await giden('siparis', yok.id))?.niyet, false, 'açma isteği gitmedi: niyet boşalır');
    kaynak.siparisler.delete(yok.id);
    const kodsuz = siparisEkle({ firmaId: await firma(null) });
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: kodsuz.id, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, once, 'kuralı tutmayan siparişe istek yok');
    assert.equal(kaynak.siparisler.get(kodsuz.id)?.hata, 'Firmanın Logo cari kodu yok.');
    assert.equal((await giden('siparis', kodsuz.id))?.niyet, false);
  });

  test('LGS-11 kalkan: zaman aşımından sonra 5 dk yeni açma yok; köprü siparişi yine açarsa numarayla bulunur, tek sipariş kalır', async () => {
    const s = siparisEkle();
    kopru.senaryo = 'gec-islenen';
    kopru.gecikmeMs = 50;
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek, ZAMAN_ASIMI_SURESI_MS));
    assert.deepEqual(await tur(ortami(bellek, ZAMAN_ASIMI_SURESI_MS)), { tur: 'gonderim', no: s.id, sonuc: 'belirsiz' });
    assert.equal((await giden('siparis', s.id))?.niyet, true, 'belirsiz istekten sonra niyet kalır');
    await bekle(100);
    kopru.senaryo = 'basari';
    simdi += 60_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, '5 dk dolmadan yeniden denenmez');
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'zaten-vardi' });
    assert.equal(kopru.siparisAcilan.get(s.no), 1, 'Logo\'da tek sipariş');
    assert.equal(kaynak.siparisler.get(s.id)?.satirRefleri?.length, 2);
  });

  test('LGS-22 tur köprüden sonra kesilirse (sipariş açıldı, sonuç yazılamadı): yeniden deneme numarayla bulur, ikinci sipariş açılmaz (borç 258)', async () => {
    const s = siparisEkle();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id });
    // Sonucu yazacak ikinci transaction açılamaz: Logo siparişi açtı, TMI bilmiyor.
    let txSayisi = 0;
    const kesik: TxAcan = {
      tx: (is) => (++txSayisi === 2 ? Promise.reject(new Error('veritabanı koptu (benzetim)')) : vt().tx(is)),
    };
    await assert.rejects(satinAlmaTuru(kesik, ortami(bellek)), /benzetim/);
    assert.equal(kopru.siparisAcilan.get(s.no), 1);
    assert.equal(kaynak.siparisler.get(s.id)?.kayitNo, null, 'TMI sonucu almadı');
    assert.equal((await giden('siparis', s.id))?.niyet, true, 'niyet kalır');
    simdi += 10_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, 'aynı süreç beklemeden yinelemez');
    assert.deepEqual(await tur(ortami(yeniSurecBellegi())), { tur: 'bos' }, 'yeni süreç de beklemeden yinelemez');
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(ortami(yeniSurecBellegi())), { tur: 'gonderim', no: s.id, sonuc: 'zaten-vardi' });
    assert.equal(kopru.siparisAcilan.get(s.no), 1, 'Logo\'da tek sipariş');
    assert.equal(kaynak.siparisler.get(s.id)?.kayitNo, String(kopru.siparisler.get(s.no)?.ref));
    assert.equal(ekleIstekleri(), 1);
  });

  test('LGS-12: Logo satır sayısı TMI satırlarını tutmazsa bağ yazılmaz, sipariş "hata"; yeniden denemede yeni sipariş açılmaz', async () => {
    const s = siparisEkle();
    kopru.satirSayisiBoz = 1;
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'yazilamadi' });
    const t = kaynak.siparisler.get(s.id)!;
    assert.equal(t.kayitNo, null);
    assert.match(t.hata ?? '', /satırları CORE satırlarıyla eşlenemedi \(Logo 1, CORE 2\)/);
    simdi += 3600_000;
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'yazilamadi' });
    assert.equal(kopru.siparisAcilan.get(s.no), 1, 'numarayla bulunur, ikinci açma yok');
    kopru.satirSayisiBoz = null;
    simdi += 3600_000;
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'zaten-vardi' });
  });

  test('LGS-13: Logo doğrulama hatası "hata" olur ve metni TMI\'ye yazılır; TMI kuralı sonucu reddederse tur düşmez ("yazilamadi")', async () => {
    const s = siparisEkle();
    kopru.senaryo = 'dogrulama';
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'reddedildi' });
    assert.match(kaynak.siparisler.get(s.id)?.hata ?? '', /Logo reddetti: Validation failed \| NAME alani zorunlu/);
    kaynak.siparisler.delete(s.id);
    const r = siparisEkle();
    kopru.senaryo = 'basari';
    kaynak.reddet = true;
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: r.id, sonuc: 'yazilamadi' });
    assert.match((await giden('siparis', r.id))?.son_hata ?? '', /CORE kaydına yazılamadı: Sipariş bu arada değişti/);
  });

  test('LGS-14 iptal: gönderim kuyruğu boşken Logo\'ya gitmiş siparişin iptali gider; reddedilen iptal "hata" ve durur, "Yeniden gönder" ile gider (3313)', async () => {
    kopru.siparisler.set('SP-2026-901', { ref: 901, satirlar: [902] });
    kopru.siparisler.set('SP-2026-911', { ref: 911, satirlar: [912] });
    kaynak.iptaller.set(901, { no: 'SP-2026-901', logoKayitNo: '901', durum: 'bekliyor', hata: null });
    assert.deepEqual(await tur(ortami()), { tur: 'iptal', no: 901, sonuc: 'gonderildi' });
    assert.equal(kopru.iptaller.get('SP-2026-901'), 1);
    assert.equal(kaynak.iptaller.get(901)?.durum, 'gonderildi');
    assert.equal((await giden('siparis-iptal', 901))?.logo_kayit_no, '901');
    kopru.senaryo = 'dogrulama';
    kaynak.iptaller.set(911, { no: 'SP-2026-911', logoKayitNo: '911', durum: 'bekliyor', hata: null });
    assert.deepEqual(await tur(ortami()), { tur: 'iptal', no: 911, sonuc: 'reddedildi' });
    assert.match(kaynak.iptaller.get(911)?.hata ?? '', /İptal: Logo reddetti: Irsaliye bagli/);
    assert.deepEqual(await tur(ortami()), { tur: 'bos' }, 'bekleme dolmadan yinelenmez');
    kopru.senaryo = 'basari';
    simdi += 3600_000;
    assert.deepEqual(await tur(ortami()), { tur: 'bos' }, 'kalıcı ret süre geçse de yinelenmez');
    assert.equal(await vt().tx((db) => gidenYenidenGonder(db, { belge: 'siparis-iptal', no: 911 }, new Date(simdi))), true);
    assert.deepEqual(await tur(ortami()), { tur: 'iptal', no: 911, sonuc: 'gonderildi' }, '"Yeniden gönder" ile gider');
  });
  function talepEkle(satirSayisi = 2): GonderilecekTalep {
    const id = ++siparisSayac;
    const t: GonderilecekTalep = {
      id, no: `ST-2026-${String(id).padStart(3, '0')}`, tarih: '2026-10-12', ihtiyacTarihi: '2026-10-20',
      satirlar: Array.from({ length: satirSayisi }, (_, i) => ({ satirId: id * 10 + i + 1, stokKodu: `HM-DEN-0000${i + 1}`, miktar: '3', birim: 'adet' })),
    };
    kaynak.talepler.set(id, { ...t, kayitNo: null, satirRefleri: null, hata: null });
    return t;
  }
  // Logo'da açılmış sipariş (sahte köprüde) ve onun TMI satırları.
  function logodakiSiparis(no: string, refler: number[]): { ref: number; satirlar: number[] } {
    const k = { ref: refler[0]! - 1, satirlar: refler };
    kopru.siparisler.set(no, k);
    return k;
  }

  test('LGS-15 talep fişi: sipariş kuyruğundan önce gider; niyet, sonra logoStatus 1 ile açılır ve satır kayıtları TMI kalemlerine yazılır', async () => {
    const s = siparisEkle();
    const t = talepEkle();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep-niyet', no: t.id });
    assert.equal(kopru.istekler.length, 0, 'niyet turunda istek yok');
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['POST /api/DemandFiche/AddRich']);
    assert.deepEqual(kopru.istekler[0]?.govde, {
      number: t.no, date: '12.10.2026', logoStatus: 1,
      lines: [
        { itemCode: 'HM-DEN-00001', amount: 3, unitCode: 'ADET', procureDate: '20.10.2026' },
        { itemCode: 'HM-DEN-00002', amount: 3, unitCode: 'ADET', procureDate: '20.10.2026' },
      ],
    });
    const logo = kopru.talepler.get(t.no)!;
    const x = kaynak.talepler.get(t.id)!;
    assert.equal(x.kayitNo, String(logo.ref));
    assert.deepEqual(x.satirRefleri, t.satirlar.map((k, i) => ({ satirId: k.satirId, logoSatirRef: String(logo.satirlar[i]) })));
    assert.equal((await giden('talep', t.id))?.son_sonuc, 'gonderildi');
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id }, 'talep kuyruğu boşalınca sipariş başlar');
  });

  test('LGS-23 (2116-3 c) eşlemesi olan malzeme talepte ve siparişte Logo koduyla gider; eşlemesi olmayan satır aynen kalır', async () => {
    await vt().tx((db) => malzemeEslemesiYaz(db, { stokKodu: 'HM-DEN-00002', logoKodu: 'LG.DEN.2', logoKayitNo: 777002 }));
    const s = siparisEkle();
    const t = talepEkle();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep-niyet', no: t.id });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'gonderildi' });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
    const kodlar = (yol: string, alan: string) => ((kopru.istekler.find((i) => i.yol === yol)?.govde as { lines: Record<string, unknown>[] }).lines).map((x) => x[alan]);
    assert.deepEqual(kodlar('/api/DemandFiche/AddRich', 'itemCode'), ['HM-DEN-00001', 'LG.DEN.2']);
    assert.deepEqual(kodlar('/api/PurchaseOrder/AddRich', 'masterCode'), ['HM-DEN-00001', 'LG.DEN.2']);
    // Kaynağın satırları değişmez: TMI kodu TMI'de kalır.
    assert.deepEqual(t.satirlar.map((x) => x.stokKodu), ['HM-DEN-00001', 'HM-DEN-00002']);
  });

  test('LGS-26 (3313 T6) satır kartı Logo\'da bilinmiyorsa talep ve sipariş gitmez, deneme sayılmaz; neden kaynağa bir kez yazılır; kart gelince gider', async () => {
    const t = talepEkle();
    kaynak.talepler.set(t.id, { ...kaynak.talepler.get(t.id)!, satirlar: [...t.satirlar, { satirId: t.id * 10 + 9, stokKodu: 'HM-YOK-00001', miktar: '1', birim: 'adet' }] });
    const sip = siparisEkle({ satirlar: [{ satirId: 99901, stokKodu: 'HM-YOK-00002', hizmet: false, miktar: '1', birim: 'kg', birimFiyat: '1' }] });
    const bellek = yeniSurecBellegi();
    const once = kopru.istekler.length;
    // 3313 Test T5: neden kaynağa iki turda bir kez yazılır.
    let talepHataYazimi = 0;
    const talepSonucu = kaynak.talepSonucu.bind(kaynak);
    kaynak.talepSonucu = async (db, id, sonuc) => { if ('hata' in sonuc && id === t.id) talepHataYazimi += 1; return talepSonucu(db, id, sonuc); };
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
    assert.equal(kopru.istekler.length, once, 'köprüye istek yok');
    assert.equal(talepHataYazimi, 1, 'neden kaynağa bir kez yazılır');
    kaynak.talepSonucu = talepSonucu;
    assert.match(kaynak.talepler.get(t.id)?.hata ?? '', /^Kart bekliyor: HM-YOK-00001\./);
    assert.match(kaynak.siparisler.get(sip.id)?.hata ?? '', /^Kart bekliyor: HM-YOK-00002\./);
    assert.equal(await giden('talep', t.id), null, 'deneme izi yok');
    assert.equal(await giden('siparis', sip.id), null);
    const bekleyenler = async (): Promise<string[]> => (await vt().tx((db) => gidenIzleme(db, new Date(simdi)))).belgeler
      .filter((b) => b.durum === 'kart-bekliyor' && [`talep:${t.id}`, `siparis:${sip.id}`].includes(`${b.belge}:${b.no}`))
      .map((b) => `${b.belge}:${b.no}:${b.yenidenGonderilebilir}:${b.denemeSayisi}`).sort();
    assert.deepEqual(await bekleyenler(), [`siparis:${sip.id}:false:null`, `talep:${t.id}:false:null`].sort(), 'izleme ekranında kart bekliyor; elle gönderilmez');
    await vt().sorgu(`INSERT INTO logo_malzeme_karti (logical_ref, kod, aktif, son_okuma) VALUES (889101, 'HM-YOK-00001', true, now()), (889102, 'HM-YOK-00002', true, now())`);
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep-niyet', no: t.id }, 'kart gelince kendiliğinden');
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'gonderildi' });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: sip.id });
    assert.deepEqual(await bekleyenler(), [], 'kart gidince izlemeden düşer');
  });

  test('LGS-30 (3315 a) projesi Logo\'ya gitmemiş talep ve sipariş "Proje bekliyor"; proje gidince proje koduyla gider; anahtar kapalıyken projesiz gider', async () => {
    const projeId = (await vt().tek<{ id: number }>(
      `INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.LGS30', 'Deneme proje', (SELECT id FROM kisi WHERE kullanici_adi = 'ls-yonetici')) RETURNING id`))!.id;
    const t = talepEkle();
    kaynak.talepler.set(t.id, { ...kaynak.talepler.get(t.id)!, projeId });
    const sip = siparisEkle({ projeId });
    const bellek = yeniSurecBellegi();
    await ayar('logo.proje-gonderimi', true);
    try {
      const once = kopru.istekler.length;
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
      assert.equal(kopru.istekler.length, once, 'köprüye istek yok');
      assert.match(kaynak.talepler.get(t.id)?.hata ?? '', /^Proje bekliyor: ORN\.LGS30\./);
      assert.equal(await giden('talep', t.id), null, 'deneme sayılmaz');
      const izleme = await vt().tx((db) => gidenIzleme(db, new Date(simdi)));
      assert.equal(izleme.sayac.projeBekliyor, 2, 'sunucu sayacı (Test T7)');
      const iz = izleme.belgeler.filter((b) => b.durum === 'proje-bekliyor');
      assert.deepEqual(iz.map((b) => `${b.belge}:${b.no}`).sort(), [`siparis:${sip.id}`, `talep:${t.id}`].sort());
      assert.equal(iz[0]?.neden, 'ORN.LGS30 Logo\'ya gidince belge kendiliğinden gider.', 'neden durumu tekrarlamaz');
      await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('proje', $1, 1, now(), 'gonderildi', '7001')`, [projeId]);
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep-niyet', no: t.id });
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'gonderildi' });
      assert.equal((kopru.istekler.find((i) => i.yol === '/api/DemandFiche/AddRich')?.govde as Record<string, unknown>).projectCode, 'ORN.LGS30');
      await ayar('logo.proje-gonderimi', false);
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: sip.id });
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: sip.id, sonuc: 'gonderildi' });
      assert.equal('projectCode' in (kopru.istekler.find((i) => i.yol === '/api/PurchaseOrder/AddRich')?.govde as object), false, 'kapalıyken projesiz');
    } finally {
      await ayar('logo.proje-gonderimi', false);
      await vt().sorgu("DELETE FROM logo_giden WHERE belge_turu = 'proje'");
    }
  });

  test('LGS-28 (3313 Test T2) Logo reddedip duran satın alma siparişi, satın alma onu yeniden "bekliyor" verince sonraki turda gider; deneme geçmişi kalır', async () => {
    const s = siparisEkle();
    kopru.senaryo = 'dogrulama';
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'reddedildi' });
    kopru.senaryo = 'basari';
    simdi += 24 * 3600_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, 'durur');
    const x = kaynak.siparisler.get(s.id)!;
    x.durum = 'bekliyor';
    x.hata = null;
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' }, 'yeniden verilen sipariş gider');
    const g = await giden('siparis', s.id);
    assert.equal(g?.son_sonuc, 'gonderildi');
    assert.ok((g?.deneme_sayisi ?? 0) >= 2, 'deneme sayısı sıfırlanmaz');
    kaynak.siparisler.delete(s.id);
  });

  test('LGS-27 (3313 T8) talepte hizmet satırı: istek gitmeden durur, neden kaynağa yazılır; yalnız malzeme satırlı talep gider', async () => {
    const sahip = ortam!.sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZ-LGS-', 0) ON CONFLICT (onek) DO NOTHING");
    await sahip.sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, hizmet_yonu, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       SELECT 'hz-lgs-1', 'hizmet', 'alinan', 'HZ-LGS-', 1, 'aktif', $1, id, id FROM kisi ORDER BY id LIMIT 1`,
      [JSON.stringify({ id: 'hz-lgs-1', com: { ad: 'Deneme hizmet', birim: 'adet' } })],
    );
    const kod = (await sahip.tek<{ kod: string }>("SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE kimlik = 'hz-lgs-1'"))!.kod;
    await vt().sorgu('INSERT INTO logo_malzeme_karti (logical_ref, kod, aktif, son_okuma) VALUES (889201, $1, true, now())', [kod]);
    const karma = talepEkle(1);
    kaynak.talepler.set(karma.id, { ...kaynak.talepler.get(karma.id)!, satirlar: [...karma.satirlar, { satirId: karma.id * 10 + 9, stokKodu: kod, miktar: '1', birim: 'adet' }] });
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami()), { tur: 'talep', no: karma.id, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, once, 'köprüye istek yok');
    assert.match(kaynak.talepler.get(karma.id)?.hata ?? '', /Talep fişine hizmet satırı yazılamaz/);
    simdi += 24 * 3600_000;
    assert.deepEqual(await tur(ortami()), { tur: 'bos' }, 'durur');
  });

  test('LGS-16 talep kalkanı (ret): cevap kaybolursa talep yeniden açılmaz; 5 dk sonra "Logo\'da kontrol edin" hatası, yeni süreçte de', async () => {
    const t = talepEkle();
    kopru.senaryo = 'cevap-kayboldu';
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    simdi += 60_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, 'bekleme dolmadan istek yok');
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'talep', no: t.id, sonuc: 'reddedildi' });
    simdi += 3600_000;
    assert.deepEqual(await tur(ortami(yeniSurecBellegi())), { tur: 'bos' }, 'durur; yeni süreçte de açılmaz (3313)');
    assert.equal(kopru.talepAcilan.get(t.no), 1, 'Logo\'da tek talep fişi');
    assert.match(kaynak.talepler.get(t.id)?.hata ?? '', /Logo'da kontrol edin/);
  });

  test('LGS-17 düzenleme: Logo satırları önce okunur, kayıtlı satır logicalRef ile gider, yeni satır eklenir; kaldırılan satır eşlemeye girmez', async () => {
    const no = 'SP-2026-701';
    const logo = logodakiSiparis(no, [702, 703]);
    const sip: LogoyaGuncellemeGidecekSiparis = {
      id: 701, no, tarih: '2026-10-12', firmaId, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: null, durum: 'bekliyor',
      logoKayitNo: String(logo.ref), kaldirilanSatirRefleri: ['703'],
      satirlar: [
        { satirId: 7011, stokKodu: 'HM-DEN-00001', hizmet: false, miktar: '8', birim: 'kg', birimFiyat: '40', logoSatirRef: '702' },
        { satirId: 7013, stokKodu: 'HM-DEN-00003', hizmet: false, miktar: '1', birim: 'adet', birimFiyat: '9', logoSatirRef: null },
      ],
    };
    kaynak.guncellemeler.set(sip.id, { ...sip, durum: 'bekliyor', hata: null, baglar: null });
    kopru.senaryo = 'cevap-kayboldu';
    assert.deepEqual(await tur(ortami()), { tur: 'guncelleme', no: sip.id, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    simdi += 3600_000;
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami()), { tur: 'guncelleme', no: sip.id, sonuc: 'gonderildi' });
    const yeni = logo.satirlar[2]!;
    assert.equal(logo.satirlar.length, 3, 'kaybolan cevaptan sonra yeni satır ikinci kez eklenmez');
    assert.deepEqual(kopru.istekler.slice(once).map((i) => `${i.yontem} ${i.yol}`), [
      `GET /api/PurchaseOrder/${no}/lines`, 'POST /api/PurchaseOrder/UpdateRich', `GET /api/PurchaseOrder/${no}/lines`,
    ]);
    const govde = kopru.istekler[once + 1]?.govde as { logicalRef: number; lines: { logicalRef?: number }[] };
    assert.equal(govde.logicalRef, logo.ref);
    assert.equal('orderStatus' in govde, false, 'düzenleme Logo\'daki sipariş durumunu ezmez (kart 2961)');
    assert.deepEqual(govde.lines.map((l) => l.logicalRef), [702, yeni], 'önceki denemede eklenen satır kaydıyla gider');
    assert.deepEqual(kaynak.guncellemeler.get(sip.id)?.baglar, [{ satirId: 7011, logoSatirRef: '702' }, { satirId: 7013, logoSatirRef: String(yeni) }]);
  });

  test('LGS-18 kapatma: yalnız Logo\'ya gitmiş satırlar lineRefs ile kapanır; kaydı geçersiz satırda istek yok (ret)', async () => {
    const no = 'SP-2026-801';
    logodakiSiparis(no, [802, 803]);
    kaynak.kapatmalar.set(801, { no, logoKayitNo: '801', satirRefleri: ['803'], durum: 'bekliyor', hata: null });
    assert.deepEqual(await tur(ortami()), { tur: 'kapatma', no: 801, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.kapananSatirlar.get(no), [803]);
    assert.equal(kaynak.kapatmalar.get(801)?.durum, 'gonderildi');
    kaynak.kapatmalar.set(811, { no: 'SP-2026-811', logoKayitNo: '811', satirRefleri: [], durum: 'bekliyor', hata: null });
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami()), { tur: 'kapatma', no: 811, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, once);
    assert.match(kaynak.kapatmalar.get(811)?.hata ?? '', /Kapatılacak Logo satırı yok/);
  });

  test('LGS-25 (2966-1 b) bekletme: kendi anahtarı kapalıyken istek yok; açıkken satırlar okunur, düzenleme gövdesi durumla gider (beklet 1, serbest 4)', async () => {
    const no = 'SP-2026-951';
    const logo = logodakiSiparis(no, [952, 953]);
    const sip = (istek: 'beklet' | 'serbest'): LogoyaBekletmeGidecekSiparis & Durum => ({
      id: 951, no, tarih: '2026-10-12', firmaId, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: null, durum: 'bekliyor', hata: null,
      logoKayitNo: String(logo.ref), kaldirilanSatirRefleri: [], istek,
      satirlar: [
        { satirId: 9511, stokKodu: 'HM-DEN-00001', hizmet: false, miktar: '5', birim: 'kg', birimFiyat: '40', logoSatirRef: '952' },
        { satirId: 9512, stokKodu: 'HM-DEN-00002', hizmet: false, miktar: '2', birim: 'adet', birimFiyat: '15.5', logoSatirRef: '953' },
      ],
    });
    kaynak.bekletmeler.set(951, sip('beklet'));
    assert.deepEqual(await tur(ortami()), { tur: 'bos' }, 'anahtar kapalı: kuyruk okunmaz');
    assert.equal(kopru.istekler.length, 0);
    await ayar('logo.siparis-bekletme-gonderimi', true);
    try {
      assert.deepEqual(await tur(ortami()), { tur: 'bekletme', no: 951, sonuc: 'gonderildi' });
      assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), [`GET /api/PurchaseOrder/${no}/lines`, 'POST /api/PurchaseOrder/UpdateRich']);
      const govde = kopru.istekler[1]?.govde as { logicalRef: number; orderStatus: number; lines: { logicalRef?: number }[] };
      assert.equal(govde.orderStatus, 1);
      assert.equal(govde.logicalRef, logo.ref);
      assert.deepEqual(govde.lines.map((l) => l.logicalRef), [952, 953], 'bütün satırlar kaydıyla gider, yeni satır yok');
      assert.equal(kaynak.bekletmeler.get(951)?.durum, 'gonderildi');
      assert.equal((await giden('siparis-bekletme', 951))?.son_sonuc, 'gonderildi');
      kaynak.bekletmeler.set(951, sip('serbest'));
      simdi += 3600_000;
      assert.deepEqual(await tur(ortami()), { tur: 'bekletme', no: 951, sonuc: 'gonderildi' });
      assert.equal((kopru.istekler.at(-1)?.govde as { orderStatus: number }).orderStatus, 4);
      // Logo'da CORE'un bildiği satır yoksa gövde gitmez: düzenleme gövdesi eksik satırı Logo'da kapatırdı.
      kaynak.bekletmeler.set(951, { ...sip('beklet'), satirlar: [...sip('beklet').satirlar, { satirId: 9513, stokKodu: 'HM-DEN-00003', hizmet: false, miktar: '1', birim: 'adet', birimFiyat: '9', logoSatirRef: '999' }] });
      simdi += 3600_000;
      const once = kopru.istekler.length;
      assert.deepEqual(await tur(ortami()), { tur: 'bekletme', no: 951, sonuc: 'reddedildi' });
      assert.deepEqual(kopru.istekler.slice(once).map((i) => i.yol), [`/api/PurchaseOrder/${no}/lines`], 'UpdateRich gitmez');
      assert.match(kaynak.bekletmeler.get(951)?.hata ?? '', /Logo'daki satırlar CORE'dakiyle tutmuyor/);
      // Logo'da CORE'un bilmediği satır varsa (elle eklenmiş ya da önceden kapatılmış) gövde gitmez: elle eklenen açık satır kapanırdı.
      logo.satirlar.push(954);
      kaynak.bekletmeler.set(951, sip('beklet'));
      simdi += 3600_000;
      const once3 = kopru.istekler.length;
      assert.deepEqual(await tur(ortami()), { tur: 'bekletme', no: 951, sonuc: 'reddedildi' });
      assert.deepEqual(kopru.istekler.slice(once3).map((i) => i.yol), [`/api/PurchaseOrder/${no}/lines`], 'fazla Logo satırında UpdateRich gitmez');
      assert.deepEqual(logo.satirlar, [952, 953, 954], 'Logo satırı değişmez');
      logo.satirlar.pop();
      // Numarasız satır (Logo'ya gitmemiş) varsa hiç istek gitmez.
      kaynak.bekletmeler.set(951, { ...sip('beklet'), satirlar: [{ ...sip('beklet').satirlar[0]!, logoSatirRef: null }] });
      simdi += 3600_000;
      const once2 = kopru.istekler.length;
      assert.deepEqual(await tur(ortami()), { tur: 'bekletme', no: 951, sonuc: 'reddedildi' });
      assert.equal(kopru.istekler.length, once2);
    } finally {
      await ayar('logo.siparis-bekletme-gonderimi', false);
    }
  });

  test('LGS-19 karşılama: önce liste okunur, yoksa yazılır; kaybolan cevaptan sonra ikinci karşılama açılmaz; iptal önce karşılamayı kaldırır', async () => {
    const no = 'SP-2026-901';
    const logo = logodakiSiparis(no, [902, 903]);
    kaynak.karsilamalar.set(9021, {
      siparisSatirId: 9021, siparisKayitNo: String(logo.ref), talepSatirRef: '555', siparisSatirRef: '902', miktar: '3', stokKodu: 'HM-DEN-00001',
      birim: 'adet', firmaId, durum: 'bekliyor', hata: null, ref: null,
    });
    kopru.senaryo = 'cevap-kayboldu';
    assert.deepEqual(await tur(ortami()), { tur: 'karsilama', no: 9021, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    simdi += 3600_000;
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami()), { tur: 'karsilama', no: 9021, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.slice(once).map((i) => `${i.yontem} ${i.yol}`), [`GET /api/DemandFiche/peg/byOrder/${logo.ref}`], 'listede var: yazma yok');
    assert.equal(kopru.karsilamalar.length, 1);
    assert.deepEqual(kopru.istekler.find((i) => i.yol === '/api/DemandFiche/peg')?.govde, {
      demandLineRef: 555, orderLineRef: 902, amount: 3, itemCode: 'HM-DEN-00001', unitCode: 'ADET', arpCode: 'C-DENEME-01',
    });
    assert.equal(kaynak.karsilamalar.get(9021)?.ref, String(kopru.karsilamalar[0]?.ref));
    kaynak.iptaller.set(901, { no, logoKayitNo: String(logo.ref), durum: 'bekliyor', hata: null });
    const iptalOnce = kopru.istekler.length;
    assert.deepEqual(await tur(ortami()), { tur: 'iptal', no: 901, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.slice(iptalOnce).map((i) => `${i.yontem} ${i.yol}`), [
      `DELETE /api/DemandFiche/peg/byOrder/${logo.ref}`, `POST /api/PurchaseOrder/${no}/cancel`,
    ]);
    assert.equal(kopru.karsilamalar.length, 0);
  });

  test('LGS-20 malzeme adı güncellemesi: açma kuyruğu boşken Logo\'ya gitmiş kartın adı UpdateRich ile gider; hizmet kartı kendi ucuna', async () => {
    kopru.kartlar.set('HM-DEN-00001', 4001);
    kopru.hizmetKartlari.set('HZ-FSN-00001', 4002);
    const gidecek: LogoyaGuncellemeGidecekMalzeme[] = [
      { no: 1, stokKodu: 'HM-DEN-00001', ad: 'Yeni ad', logoKayitNo: '4001', tur: 'hammadde', hizmetYonu: null },
      { no: 2, stokKodu: 'HZ-FSN-00001', ad: 'Kaplama yeni', logoKayitNo: '4002', tur: 'hizmet', hizmetYonu: 'alinan' },
      { no: 3, stokKodu: 'HM-DEN-00009', ad: 'Logo\'da yok', logoKayitNo: '4009', tur: 'hammadde', hizmetYonu: null },
    ];
    const sonuclar = new Map<number, { ad: string | null } & Tamam>();
    const bellek = yeniSurecBellegi();
    const o: TurOrtami = {
      kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: TEST_ISTEK_SURESI_MS }), bellek, saat: () => new Date(simdi),
      malzemeGuncelleme: {
        gidecekler: async () => gidecek.filter((g) => !sonuclar.has(g.no)),
        sonuc: async (_db, no, x) => { sonuclar.set(no, x); },
      },
    };
    const mtur = (): Promise<TurSonucu> => malzemeTuru(vt(), o);
    assert.equal((await mtur()).tur, 'liste', 'ilk tur birim seti listesini okur');
    // Ayar kapalıyken (varsayılan) güncelleme kuyruğu okunmaz, istek atılmaz.
    const onceki = kopru.istekler.length;
    assert.deepEqual(await mtur(), { tur: 'bos' });
    assert.equal(kopru.istekler.length, onceki);
    assert.equal(sonuclar.size, 0);
    await ayar('logo.malzeme-guncelleme-gonderimi', true);
    assert.deepEqual(await mtur(), { tur: 'guncelleme', no: 1, sonuc: 'gonderildi' });
    assert.deepEqual(await mtur(), { tur: 'guncelleme', no: 2, sonuc: 'gonderildi' });
    assert.deepEqual(await mtur(), { tur: 'guncelleme', no: 3, sonuc: 'reddedildi' });
    assert.deepEqual(sonuclar.get(1), { ad: 'Yeni ad', tamam: true }, 'gönderilen ad sonuçla döner');
    assert.deepEqual([...kopru.adGuncellemeleri], [['HM-DEN-00001', 'Yeni ad'], ['HZ-FSN-00001', 'Kaplama yeni']]);
    assert.deepEqual(kopru.istekler.filter((i) => i.yol.endsWith('UpdateRich')).map((i) => i.yol),
      ['/api/Material/UpdateRich', '/api/PurchaseService/UpdateRich', '/api/Material/UpdateRich']);
    const ret = sonuclar.get(3);
    assert.match(ret && 'hata' in ret ? ret.hata : '', /Güncelleme: .*Card not found/);
  });
  test('LGS-21 gerçek saat: her okumada ilerleyen saatle niyet bir sonraki turda taze sayılır; talep ve sipariş beklemeden gider', async () => {
    const t = talepEkle();
    const s = siparisEkle();
    const bellek = yeniSurecBellegi();
    const ilerleyen = (): SatinAlmaTurOrtami => ({ ...ortami(bellek), saat: () => new Date((simdi += 1)) });
    assert.deepEqual(await tur(ilerleyen()), { tur: 'talep-niyet', no: t.id });
    assert.deepEqual(await tur(ilerleyen()), { tur: 'talep', no: t.id, sonuc: 'gonderildi' });
    assert.deepEqual(await tur(ilerleyen()), { tur: 'niyet', no: s.id });
    assert.deepEqual(await tur(ilerleyen()), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
  });

  test('LGS-31 (3698) 503: oturum açılamadı = gönderilmedi; "yeniden denenecek" olur (belirsiz değil), neden saklanır, bekleme bitince Logo\'da belge aranmadan gider', async () => {
    baglantiHatasiniTemizle();
    const s = siparisEkle();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id });
    kopru.senaryo = 'oturum-yok';
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'ulasilamadi' });
    const g = await giden('siparis', s.id);
    assert.equal(g?.son_sonuc, 'ulasilamadi');
    assert.equal(g?.niyet, false, 'istek Logo\'ya gitmedi: niyet kalmaz');
    assert.match(g?.son_hata ?? '', /^Logo oturumu açılamadı \(UserLogin, kod -93\), belge gönderilmedi; kendiliğinden yeniden denenir\. Logo lisansı dolu/);
    const sonraki = await vt().tek<{ sonraki: Date }>(`SELECT sonraki_deneme AS sonraki FROM logo_giden WHERE belge_turu = 'siparis' AND belge_no = $1`, [s.id]);
    assert.equal(sonraki?.sonraki.getTime(), simdi + 240_000, 'yardımcının bildirdiği kalan bekleme kadar sonra');
    const izleme = await vt().tx((db) => gidenIzleme(db, new Date(simdi)));
    const satir = izleme.belgeler.find((b) => b.belge === 'siparis' && b.no === s.id);
    assert.equal(satir?.durum, 'yeniden-denenecek');
    assert.equal(satir?.kontrolEdilebilir, false);
    const hata = sonBaglantiHatasi();
    assert.equal(hata?.adim, 'UserLogin');
    assert.equal(hata?.kod, -93);
    assert.equal(hata?.yenidenDeneme, new Date(Date.parse(hata?.zaman ?? '') + 240_000).toISOString());
    assert.match(hata?.aciklama ?? '', /lisansı dolu/);
    simdi += 239_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' }, 'bekleme bitmeden istek yok');
    kopru.senaryo = 'basari';
    simdi += 2_000;
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'niyet', no: s.id });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.slice(once).some((i) => i.yol.startsWith('/api/Document/search')), false, 'Logo\'da belge araması yok');
    assert.equal(kopru.siparisAcilan.get(s.no), 1);
    assert.equal(sonBaglantiHatasi(), null, 'başarılı yazma bağlantı hatasını siler');
  });

  test('LGS-32 (3698) 500 gövdesi bugünkü gibi belirsiz kalır: niyet kalır, 5 dk beklenir, sonra numarayla bulunur', async () => {
    const s = siparisEkle();
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    kopru.senaryo = 'sunucu-hatasi';
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'belirsiz' });
    const g = await giden('siparis', s.id);
    assert.equal(g?.niyet, true);
    assert.match(g?.son_hata ?? '', /Köprü hata verdi \(500\); işlenip işlenmediği bilinmiyor/);
    const sonraki = await vt().tek<{ sonraki: Date }>(`SELECT sonraki_deneme AS sonraki FROM logo_giden WHERE belge_turu = 'siparis' AND belge_no = $1`, [s.id]);
    assert.equal(sonraki?.sonraki.getTime(), simdi + BELIRSIZ_BEKLEME_MS);
    kopru.senaryo = 'basari';
    simdi += 60_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
  });

  test('LGS-33 (3698) Logo sipariş durumu ayarı: ayar yokken yeni sipariş 4; "1" olunca sonraki yeni sipariş 1; güncelleme durum yollamaz; yetkisiz kişi değiştiremez; değişiklik defterde', async () => {
    const ANAHTAR = 'logo.satin-alma-siparis-durumu';
    const degistir = (deger: string, cerezi: string) => app.inject({
      method: 'POST', url: `/api/ayarlar/${ANAHTAR}/degistir`, headers: { cookie: cerezi, 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    const defter = () => ortam!.sahip.sorgu<{ islem: string; alanlar: { deger?: { eski: unknown; yeni: unknown } }; kisi_id: number | null }>(
      `SELECT islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = 'ayar' AND anahtar = jsonb_build_object('anahtar', $1::text) ORDER BY id`, [ANAHTAR]);
    const acmaDurumu = async (): Promise<unknown> => {
      const s = siparisEkle();
      const bellek = yeniSurecBellegi();
      await tur(ortami(bellek));
      assert.deepEqual(await tur(ortami(bellek)), { tur: 'gonderim', no: s.id, sonuc: 'gonderildi' });
      const ekle = [...kopru.istekler].reverse().find((i) => i.yol === '/api/PurchaseOrder/AddRich');
      assert.equal((ekle?.govde as { number: string }).number, s.no);
      return (ekle?.govde as { orderStatus?: unknown }).orderStatus;
    };
    // Ayar hiç yazılmamış: varsayılan 4.
    assert.equal(await acmaDurumu(), 4);
    const ilkSip = [...kaynak.siparisler.values()][0]!;
    // Yetkisiz kişi değiştiremez; satır ve defter satırı oluşmaz.
    const roller = ((await app.inject({ method: 'GET', url: '/api/roller', headers: { cookie: cerez } })).json() as { roller: { id: number; yonetici: boolean | null }[] }).roller;
    const rol = roller.find((r) => r.yonetici !== true);
    assert.ok(rol, 'yönetici olmayan rol yok');
    const kisiId = await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Yetkisiz Kişi', kullaniciAdi: 'ls-yetkisiz', parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      return id;
    });
    const girisC = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ls-yetkisiz', parola: PAROLA } });
    const yetkisizCerez = String(girisC.headers['set-cookie']).split(';')[0] ?? '';
    assert.ok(kisiId > 0);
    assert.equal((await degistir('1', yetkisizCerez)).statusCode, 403);
    assert.equal((await defter()).length, 0);
    assert.equal(await acmaDurumu(), 4, 'reddedilen değişiklik durumu değiştirmez');
    // Yönetici değiştirir; defter kim, eski ve yeni değeri taşır.
    assert.equal((await degistir('1', cerez)).statusCode, 200);
    assert.deepEqual((await defter()).map((d) => ({ islem: d.islem, deger: d.alanlar.deger, kisi: d.kisi_id })), [{ islem: 'ekle', deger: { eski: null, yeni: '1' }, kisi: yoneticiId }]);
    assert.equal(await acmaDurumu(), 1, 'sonraki yeni sipariş öneri olarak açılır');
    // Logo'da açılmış sipariş: güncelleme gönderimi ayar "1" iken de durum yollamaz.
    const logo = kopru.siparisler.get(ilkSip.no)!;
    kaynak.guncellemeler.set(ilkSip.id, {
      ...ilkSip, durum: 'bekliyor', hata: null, baglar: null, logoKayitNo: String(logo.ref), kaldirilanSatirRefleri: [],
      satirlar: ilkSip.satirlar.map((x, i) => ({ ...x, miktar: '9', logoSatirRef: String(logo.satirlar[i]) })),
    });
    const once = kopru.istekler.length;
    simdi += 3600_000;
    assert.deepEqual(await tur(ortami()), { tur: 'guncelleme', no: ilkSip.id, sonuc: 'gonderildi' });
    const guncelleme = kopru.istekler.slice(once).find((i) => i.yol === '/api/PurchaseOrder/UpdateRich');
    assert.ok(guncelleme, 'güncelleme gitti');
    assert.equal('orderStatus' in (guncelleme.govde as object), false, 'ayar yalnız ilk gönderimde uygulanır');
    // Varsayılana dönüş de deftere düşer; yalnız sonraki gönderimler etkilenir.
    assert.equal((await degistir('4', cerez)).statusCode, 200);
    assert.equal((await defter()).length, 2);
    assert.equal(await acmaDurumu(), 4);
  });
});
