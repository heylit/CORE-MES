import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { satisIsi } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS } from './kurallar.ts';
import type { GonderilecekSatisSiparisi } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { satisTuru, yeniSurecBellegi } from './servis.ts';
import type { LogoyaGidecekSatisTeklifi, SatisKaynagi, SatisTurOrtami, SiparisLogoSonucu, TurSonucu } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const TEST_ISTEK_SURESI_MS = 5000;

// Portalın disari.ts işlevleri gelene kadar kaynak test içinde tutulur (UYUM-BORCU "bağlamada kapanacak"). Sonucu alan belge kuyruktan çıkar.
type Sonuclu = { kayitNo: string | null; satirRefleri: { satirId: number; logoSatirRef: string }[] | null; hata: string | null };
interface SahteKaynak extends SatisKaynagi {
  teklifler: Map<number, LogoyaGidecekSatisTeklifi & Sonuclu>;
  siparisler: Map<number, GonderilecekSatisSiparisi & Sonuclu>;
}

function sahteKaynak(): SahteKaynak {
  const yaz = (x: Sonuclu | undefined, sonuc: SiparisLogoSonucu): void => {
    if (!x) throw new Error('Belge yok.');
    if ('hata' in sonuc) { x.hata = sonuc.hata; return; }
    x.kayitNo = sonuc.kayitNo;
    x.satirRefleri = sonuc.satirlar;
    x.hata = null;
  };
  const k: SahteKaynak = {
    teklifler: new Map(),
    siparisler: new Map(),
    async teklifGidecekler(_db: Db, sinir: number) { return [...k.teklifler.values()].filter((t) => t.kayitNo === null).slice(0, sinir); },
    async teklifSonucu(_db: Db, id: number, sonuc: SiparisLogoSonucu) { yaz(k.teklifler.get(id), sonuc); },
    async siparisGidecekler(_db: Db, sinir: number) { return [...k.siparisler.values()].filter((t) => t.kayitNo === null).slice(0, sinir); },
    async siparisSonucu(_db: Db, id: number, sonuc: SiparisLogoSonucu) { yaz(k.siparisler.get(id), sonuc); },
  };
  return k;
}

describe('Logo satış gönderimi (teklif, tekliften sipariş), sahte köprü ve sahte kaynakla (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kopru: SahteKopru;
  let kaynak: SahteKaynak;
  let firmaId = 0;
  let firmaSayac = 0;
  let sayac = 0;
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
    const r = await tamam<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: `Logo satış firma ${++firmaSayac}`, tur: 'musteri', logoCariKodu });
    return r.firma.id;
  }
  function teklifEkle(ek: Partial<LogoyaGidecekSatisTeklifi> = {}): LogoyaGidecekSatisTeklifi {
    const id = ++sayac;
    const t: LogoyaGidecekSatisTeklifi = {
      id, no: `TK-2026-${String(id).padStart(3, '0')}`, tarih: '2026-10-12', gecerlilikBitis: null, firmaId, paraBirimi: 'TRY', kur: null,
      satirlar: [
        { satirId: id * 10 + 1, stokKodu: 'MM-DEN-00001', hizmet: false, miktar: '10', birim: 'adet', birimFiyat: '125', iskontoYuzdesi: null, termin: null },
        { satirId: id * 10 + 2, stokKodu: 'MM-DEN-00002', hizmet: false, miktar: '4', birim: 'adet', birimFiyat: '80', iskontoYuzdesi: '10', termin: null },
      ],
      ...ek,
    };
    kaynak.teklifler.set(id, { ...t, kayitNo: null, satirRefleri: null, hata: null });
    return t;
  }
  const ortami = (bellek = yeniSurecBellegi()): SatisTurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: TEST_ISTEK_SURESI_MS }), bellek, saat: () => new Date(simdi), kaynak,
  });
  const tur = (o: SatisTurOrtami): Promise<TurSonucu> => satisTuru(vt(), o);
  const yazmalar = (): string[] => kopru.istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol);

  before(async () => {
    ortam = await testVeritabaniKur('logosat');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo', kullaniciAdi: 'lt-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lt-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
    await ayar('logo.satis-gonderimi', true);
    firmaId = await firma('M-DENEME-01');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kopru.satisMusterileri.add('M-DENEME-01');
    kaynak = sahteKaynak();
    simdi += 24 * 3600_000;
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LGT-6 kapalı: "satış gönderimi" ya da "Logo bağlantısı" kapalıyken istek ve yazma yok; iş "bekliyor" döner', async () => {
    teklifEkle();
    await ayar('logo.satis-gonderimi', false);
    try {
      assert.deepEqual(await tur(ortami()), { tur: 'satis-kapali' });
      assert.equal(await isiBirKezCalistir(vt(), satisIsi(kaynak)), 'bekliyor');
      await ayar('logo.baglanti', false);
      assert.deepEqual(await tur(ortami()), { tur: 'kapali' });
    } finally {
      await ayar('logo.baglanti', true);
      await ayar('logo.satis-gonderimi', true);
    }
    assert.equal(kopru.istekler.length, 0);
  });

  test('LGT-7 kabul: teklif niyetle, satış müşterisi denetiminden sonra açılır; satırlar teklif kaydından okunup bağlanır; sonra sipariş tekliften açılır', async () => {
    const t = teklifEkle();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-teklifi-niyet', no: t.id });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-teklifi', no: t.id, sonuc: 'gonderildi' });
    const logo = kopru.satisTeklifleri.get(t.no)!;
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), [
      'GET /api/SalesOffer/customer/M-DENEME-01', 'POST /api/SalesOffer/AddRich', `GET /api/SalesOffer/${logo.ref}`,
    ]);
    const x = kaynak.teklifler.get(t.id)!;
    assert.equal(x.kayitNo, String(logo.ref));
    assert.deepEqual(x.satirRefleri?.map((r) => r.logoSatirRef), logo.satirlar.map(String));

    const sid = ++sayac;
    kaynak.siparisler.set(sid, {
      id: sid, no: 'SS-2026-001', tarih: '2026-10-13', teklifKayitNo: x.kayitNo, kayitNo: null, satirRefleri: null, hata: null,
      satirlar: [{ satirId: 901, teklifSatirRef: x.satirRefleri![0]!.logoSatirRef, miktar: '6', termin: null }],
    });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-siparisi-niyet', no: sid });
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-siparisi', no: sid, sonuc: 'gonderildi' });
    const sip = kopru.satisSiparisleri.get('SS-2026-001')!;
    assert.equal(sip.teklifRef, logo.ref);
    assert.deepEqual(sip.govde, { number: 'SS-2026-001', date: '13.10.2026', orderStatus: 4, lines: [{ offerLineRef: logo.satirlar[0], quantity: 6 }] });
    assert.equal(kaynak.siparisler.get(sid)?.kayitNo, String(sip.ref));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
  });

  test('LGT-8 (ret): cari Logo\'da satış müşterisi değilse teklif açılmaz; firma cari kodu yoksa hiç istek yok', async () => {
    const yok = teklifEkle({ firmaId: await firma('M-CRM-YOK') });
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-teklifi', no: yok.id, sonuc: 'reddedildi' });
    assert.deepEqual(yazmalar(), []);
    assert.match(kaynak.teklifler.get(yok.id)?.hata ?? '', /M-CRM-YOK Logo'da satış müşterisi \(CRM\) olarak tanımlı değil/);
    kaynak.teklifler.delete(yok.id);
    const kodsuz = teklifEkle({ firmaId: null });
    const once = kopru.istekler.length;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-teklifi', no: kodsuz.id, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, once);
    assert.equal(kaynak.teklifler.get(kodsuz.id)?.hata, 'Firmanın Logo cari kodu yok.');
  });

  test('LGT-9 kalkan (ret): cevap kaybolursa teklif yeniden açılmaz; 5 dk sonra "Logo\'da kontrol edin", yeni süreçte de', async () => {
    const t = teklifEkle();
    kopru.senaryo = 'cevap-kayboldu';
    const bellek = yeniSurecBellegi();
    await tur(ortami(bellek));
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'satis-teklifi', no: t.id, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    simdi += 60_000;
    assert.deepEqual(await tur(ortami(bellek)), { tur: 'bos' });
    simdi += BELIRSIZ_BEKLEME_MS;
    for (const b of [bellek, yeniSurecBellegi()]) {
      assert.deepEqual(await tur(ortami(b)), { tur: 'satis-teklifi', no: t.id, sonuc: 'reddedildi' });
      simdi += 3600_000;
    }
    assert.equal(kopru.satisTeklifAcilan.get(t.no), 1, 'Logo\'da tek teklif');
    assert.match(kaynak.teklifler.get(t.id)?.hata ?? '', /Logo'da kontrol edin/);
  });

  test('LGT-10 (ret): teklifi Logo\'da olmayan sipariş istek atmadan "hata"; Logo reddi metniyle yazılır', async () => {
    const sid = ++sayac;
    kaynak.siparisler.set(sid, {
      id: sid, no: 'SS-2026-002', tarih: '2026-10-13', teklifKayitNo: null, kayitNo: null, satirRefleri: null, hata: null,
      satirlar: [{ satirId: 911, teklifSatirRef: null, miktar: '1', termin: null }],
    });
    assert.deepEqual(await tur(ortami()), { tur: 'satis-siparisi', no: sid, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, 0);
    assert.equal(kaynak.siparisler.get(sid)?.hata, 'Siparişin teklifi Logo\'da yok.');
  });
});
