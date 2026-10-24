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
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS, FATURA_TUR_SINIRI, FATURA_YENIDEN_OKUMA_MS, LISTE_TAZELEME_MS } from './kurallar.ts';
import type { GonderilecekMalzemeFisi } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { emirlerinMalzemeFisleri, logoIcinMalzemeFisleri, malzemeFisiDegisiklikleri } from '../stok/disari.ts';
import {
  faturaTuru, fisDegisiklikleriniAl, listeOkumaTuru, malKabulTuru, malzemeFisiLogoDurumlari, malzemeFisiTuru, stokMalzemeFisiKaynagi, yeniSurecBellegi,
} from './servis.ts';
import type { MalzemeFisiKaynagi, MalzemeFisiTurOrtami, StokFisDegisikligi, StokFisKaynaklari, TurOrtami, TurSonucu } from './servis.ts';
import type { MalzemeFisiTuru } from '#paylasilan/sozlesme/stok.ts';
import type { FisTuru } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
const TEST_ISTEK_SURESI_MS = 5000;
const ZAMAN_ASIMI_SURESI_MS = 300;

interface SahteFis { fis: GonderilecekMalzemeFisi; kayitNo: string | null; hata: string | null }

describe('Logo okuma akışları ve malzeme fişi, sahte köprüyle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kopru: SahteKopru;
  let simdi = Date.parse('2026-10-15T10:00:00Z');
  const fisler = new Map<string, SahteFis>();
  let fisSayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean | string): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const ortami = (bellek = yeniSurecBellegi(), sureMs = TEST_ISTEK_SURESI_MS): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs }), bellek, saat: () => new Date(simdi),
  });
  const istekSayisi = (): number => kopru.istekler.length;
  const sayi = async (tablo: string): Promise<number> => Number((await vt().tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo}`))?.n);

  const fisKaynagi: MalzemeFisiKaynagi = {
    async gidecekler(_db: Db, sinir: number) {
      return [...fisler.values()].filter((x) => x.kayitNo === null).slice(0, sinir).map((x) => ({ tur: x.fis.tur, id: x.fis.id, no: x.fis.no, fis: x.fis }));
    },
    async sonuc(_db: Db, tur: FisTuru, id: number, sonuc) {
      const x = fisler.get(`${tur}:${id}`);
      if (!x) throw gecersiz('Fiş yok.');
      if ('hata' in sonuc) { x.hata = sonuc.hata; return; }
      x.kayitNo = sonuc.kayitNo;
      x.hata = null;
    },
  };
  const fisEkle = (tur: FisTuru, ek: Partial<GonderilecekMalzemeFisi> = {}): GonderilecekMalzemeFisi => {
    const id = ++fisSayac;
    const fis: GonderilecekMalzemeFisi = {
      id, tur, no: `${tur === 'sarf-fisi' ? 'SF' : 'UG'}-${String(id).padStart(6, '0')}`, tarih: '2026-10-15', saat: '09:30:00', projeKodu: 'PRJ-DENEME',
      satirlar: [{ satirId: id * 10, stokKodu: 'HM-DEN-00001', miktar: '2.5', birim: 'kg', aciklama: 'Deneme' }],
      ...ek,
    };
    fisler.set(`${tur}:${fis.id}`, { fis, kayitNo: null, hata: null });
    return fis;
  };
  const fisOrtami = (bellek = yeniSurecBellegi(), sureMs = TEST_ISTEK_SURESI_MS): MalzemeFisiTurOrtami => ({ ...ortami(bellek, sureMs), kaynak: fisKaynagi });

  // Stoğun sahte fişleri: değişiklik sayacı, zamanı ve elle istek stoktaki gibi; satır değişince sayaç artar.
  interface SahteStokFisi { id: number; tur: MalzemeFisiTuru; no: string; uretimEmriId: number | null; degisiklik: number; zaman: string; istek: string | null; satirlar: { stokKodu: string | null; birim: string | null; miktar: string }[] }
  const stokFisleri = new Map<number, SahteStokFisi>();
  let stokSaati = Date.parse('2026-10-24T08:00:00Z');
  const stokDegistir = (id: number, ek: Partial<SahteStokFisi> = {}): SahteStokFisi => {
    stokSaati += 1000;
    const eski = stokFisleri.get(id);
    const f: SahteStokFisi = {
      id, tur: 'sarf', no: `UE-DEN-${id}`, uretimEmriId: 7, satirlar: [], istek: null, ...eski, ...ek, degisiklik: (eski?.degisiklik ?? 0) + 1, zaman: new Date(stokSaati).toISOString(),
    };
    stokFisleri.set(id, f);
    return f;
  };
  const stokKaynaklari: StokFisKaynaklari = {
    async degisiklikler(_db, a) {
      return [...stokFisleri.values()]
        .filter((f) => a.zaman === null || f.zaman > a.zaman || (f.zaman === a.zaman && f.id > a.id))
        .sort((x, y) => x.zaman.localeCompare(y.zaman) || x.id - y.id).slice(0, a.sinir)
        .map((f): StokFisDegisikligi => ({ id: f.id, tur: f.tur, uretimEmriId: f.uretimEmriId, degisiklik: f.degisiklik, degisiklikZamani: f.zaman, gonderimIstegi: f.istek }));
    },
    async fisler(_db, idler) {
      return new Map(idler.flatMap((id) => {
        const f = stokFisleri.get(id);
        if (!f) return [];
        const satirlar = f.satirlar.map((x) => ({ ...x, aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null }));
        return [[id, { id, tur: f.tur, no: f.no, tarih: '2026-10-24', saat: '11:00:00', uretimEmriId: f.uretimEmriId, satirlar }]];
      }));
    },
    async emirFisleri(_db, emirIdler) {
      return [...stokFisleri.values()].filter((f) => f.uretimEmriId !== null && emirIdler.includes(f.uretimEmriId))
        .map((f) => ({ id: f.id, tur: f.tur, uretimEmriId: f.uretimEmriId! }));
    },
  };
  const stokKaynagi = stokMalzemeFisiKaynagi(stokKaynaklari);
  const durum = async (id: number) => {
    const f = stokFisleri.get(id)!;
    return (await vt().tx((db) => malzemeFisiLogoDurumlari(db, [{ id, tur: f.tur, uretimEmriId: f.uretimEmriId, degisiklik: f.degisiklik, gonderimIstegi: f.istek, satirVar: f.satirlar.length > 0 }]))).get(id)!;
  };

  before(async () => {
    ortam = await testVeritabaniKur('logookuma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuma', kullaniciAdi: 'lo-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lo-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    fisler.clear();
    simdi += 24 * 3600_000;
    for (const t of ['logo_mal_kabul_satiri', 'logo_mal_kabul_imleci', 'logo_cari', 'logo_ambar', 'logo_liste_okuma', 'logo_fatura', 'logo_fatura_okuma', 'logo_siparis_no', 'logo_malzeme_fisi_giden']) {
      await vt().sorgu(`DELETE FROM ${t}`);
    }
    await vt().sorgu("DELETE FROM logo_giden WHERE belge_turu = 'siparis'");
    for (const a of ['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi']) await ayar(a, false);
    for (const [a, d] of [['sarf', 'otomatik'], ['uretim-girisi', 'otomatik'], ['fire', 'kapali'], ['sayim-fazlasi', 'kapali'], ['sayim-eksigi', 'kapali'], ['ambar', 'kapali']]) {
      await ayar(`logo.malzeme-fisi-${a}`, d!);
    }
    await vt().sorgu("UPDATE logo_malzeme_fisi_imleci SET zaman = '2026-01-01T00:00:00Z', fis_id = 0, en_buyuk_fis_id = 0");
    stokFisleri.clear();
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LOGO-O4 yeni ayarların hepsi kapalı gelir; kapalıyken (ya da bağlantı kapalıyken, köprü yokken) hiçbir tur istek atmaz ve yazmaz', async () => {
    kopru.malKabulSatirlari.push({ logicalRef: 1, quantity: 1 });
    kopru.cariListesi = [{ code: 'C-1', name: 'Deneme' }];
    fisEkle('sarf-fisi');
    const turlar: [string, () => Promise<TurSonucu>][] = [
      ['mal-kabul-kapali', () => malKabulTuru(vt(), ortami())],
      ['liste-kapali', () => listeOkumaTuru(vt(), ortami())],
      ['fatura-kapali', () => faturaTuru(vt(), ortami())],
      ['malzeme-fisi-kapali', () => malzemeFisiTuru(vt(), fisOrtami())],
    ];
    for (const [beklenen, kos] of turlar) assert.deepEqual(await kos(), { tur: beklenen });
    assert.equal(istekSayisi(), 0);
    // Anahtar açık ama "Logo bağlantısı" kapalı ya da köprü değişkenleri yok: yine istek yok.
    for (const a of ['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi']) await ayar(a, true);
    await ayar('logo.baglanti', false);
    try {
      for (const [, kos] of turlar) assert.deepEqual(await kos(), { tur: 'kapali' });
    } finally {
      await ayar('logo.baglanti', true);
    }
    assert.deepEqual(await malKabulTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await listeOkumaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await faturaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await malzemeFisiTuru(vt(), { ...fisOrtami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.equal(istekSayisi(), 0);
    for (const t of ['logo_mal_kabul_satiri', 'logo_mal_kabul_imleci', 'logo_cari', 'logo_ambar', 'logo_fatura', 'logo_malzeme_fisi_giden']) assert.equal(await sayi(t), 0, t);
  });

  test('LOGO-O5 iş listesi: yeni okuma işleri kayıtlı; ayar kapalıyken ve köprü değişkeni yokken iş "bekliyor" döner, istek ve yazma yok', async () => {
    const adlar = ['logo-mal-kabul-okumasi', 'logo-liste-okumasi', 'logo-fatura-okumasi'];
    for (const ad of adlar) {
      const is = isler.find((i) => i.ad === ad);
      assert.ok(is, `${ad} iş listesinde yok`);
      assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor');
    }
    // 335: malzeme fişi işi listede; anahtar kapalıyken o da bekler.
    assert.equal(await isiBirKezCalistir(vt(), isler.find((i) => i.ad === 'logo-malzeme-fisi-gonderimi')!), 'bekliyor');
    await ayar('logo.mal-kabul-okumasi', true);
    assert.equal(await isiBirKezCalistir(vt(), isler.find((i) => i.ad === 'logo-mal-kabul-okumasi')!), 'bekliyor', 'köprü değişkeni yok');
    assert.equal(istekSayisi(), 0);
  });

  test('LOGO-O6 mal kabul: açıkken since imleciyle yalnız GET; satırlar saklanır, tekrar okumada çift satır yok, imleç ilerler', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulSatirlari.push(
      { logicalRef: 11, orderLineRef: 101, itemCode: 'HM-DEN-00001', quantity: 4, unitCode: 'KG', ficheNo: 'IR-1' },
      { logicalRef: 12, orderLineRef: 102, itemCode: 'HM-DEN-00002', quantity: 2.5 },
      { quantity: 9 },
    );
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(kopru.malKabulSince, [0]);
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/PurchaseOrder/receipts']);
    const satirlar = await vt().sorgu<{ logical_ref: number; siparis_satir_ref: number | null; malzeme_kodu: string | null; miktar: string | null; ham: { quantity?: number } }>(
      'SELECT logical_ref, siparis_satir_ref, malzeme_kodu, miktar, ham FROM logo_mal_kabul_satiri ORDER BY logical_ref');
    assert.deepEqual(satirlar.map((x) => [x.logical_ref, x.siparis_satir_ref, x.malzeme_kodu, x.miktar]), [[11, 101, 'HM-DEN-00001', '4'], [12, 102, 'HM-DEN-00002', '2.5']]);
    assert.equal(satirlar[0]?.ham.quantity, 4, 'tam satır ham saklanır');
    // Tekrar okuma: imleç 12; yeni satır yok -> çift satır yok.
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(kopru.malKabulSince, [0, 12]);
    // Köprü eski satırı yine verirse (imleç geriye düşmüş gibi) tekil anahtar çift satırı engeller; imleç geriye gitmez.
    kopru.malKabulSatirlari.push({ logicalRef: 13, orderLineRef: 103, quantity: 1 });
    await vt().sorgu('UPDATE logo_mal_kabul_imleci SET son_ref = 0');
    assert.equal((await malKabulTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 3);
    assert.equal((await vt().tek<{ son_ref: number }>('SELECT son_ref FROM logo_mal_kabul_imleci'))?.son_ref, 13);
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'), 'Logo\'ya yalnız GET gider');
    assert.equal(await sayi('logo_giden'), 0, 'okuma giden kutusuna yazmaz');
  });

  test('LOGO-O7 mal kabul: zarf biçimi de okunur; okunamayan cevap imleci ilerletmez ve satır yazmaz', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulBicimi = 'zarf';
    kopru.malKabulSatirlari.push({ logicalRef: 21, quantity: 1 });
    assert.equal((await malKabulTuru(vt(), ortami())).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1);
    await vt().sorgu('DELETE FROM logo_mal_kabul_satiri');
    await vt().sorgu('DELETE FROM logo_mal_kabul_imleci');
    kopru.malKabulBicimi = 'bozuk';
    assert.deepEqual(await malKabulTuru(vt(), ortami()), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'belirsiz', sayi: 0 });
    assert.equal(await sayi('logo_mal_kabul_satiri'), 0);
    assert.equal(await sayi('logo_mal_kabul_imleci'), 0, 'imleç ilerlemedi');
  });

  test('LOGO-O8 mal kabul: 401 ve ağ hatasında tur düşmez, hiçbir şey yazılmaz; başarısız okuma bekleme süresi dolmadan yinelenmez', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulSatirlari.push({ logicalRef: 31, quantity: 1 });
    kopru.senaryo = 'yetkisiz';
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'bos' }, 'bekleme dolmadan ikinci istek yok');
    assert.equal(istekSayisi(), 1);
    assert.equal(await sayi('logo_mal_kabul_satiri'), 0);
    // Köprü düzelince bekleme süresi sonra okunur.
    kopru.senaryo = 'basari';
    simdi += 6 * 60_000;
    assert.equal((await malKabulTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1);
    // Ağ hatası: köprü kapalı.
    const adres = kopru.adres;
    await kopru.kapat();
    const o: TurOrtami = { kopru: kopruIstemcisiKur({ adres, anahtar: 'x' }, { sureMs: 2000 }), bellek: yeniSurecBellegi(), saat: () => new Date(simdi) };
    assert.deepEqual(await malKabulTuru(vt(), o), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'ulasilamadi', sayi: 0 });
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1, 'önceki kayıtlar durur');
  });

  test('LOGO-O9 cari ve ambar: saatte bir, turda tek istek; kod ve ad yazılır, tekrar okumada çift satır yok, silinen kod önbellekten düşer', async () => {
    await ayar('logo.liste-okumasi', true);
    kopru.cariListesi = [{ code: 'C-DEN-1', name: 'Deneme Cari 1' }, { CODE: 'C-DEN-2', title: 'Deneme Cari 2' }, { name: 'kodsuz' }];
    kopru.ambarlar = [{ nr: 0, name: 'Merkez' }, { nr: 1, name: 'Yedek' }];
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => listeOkumaTuru(vt(), ortami(bellek));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'cari', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'ambar', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await kos(), { tur: 'bos' }, 'iki liste de taze');
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/Arp/list', 'GET /api/Lookup/warehouses']);
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_cari ORDER BY kod')).map((x) => [x.kod, x.ad]),
      [['C-DEN-1', 'Deneme Cari 1'], ['C-DEN-2', 'Deneme Cari 2']]);
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_ambar ORDER BY kod')).map((x) => [x.kod, x.ad]), [['0', 'Merkez'], ['1', 'Yedek']]);
    // Bir saat sonra yeniden okunur; yinelenen satır yok, listeden düşen kod önbellekten de düşer, boş cevap önbelleği boşaltmaz.
    simdi += LISTE_TAZELEME_MS + 1000;
    kopru.cariListesi = [{ code: 'C-DEN-1', name: 'Deneme Cari 1 yeni' }];
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'cari', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_cari')).map((x) => [x.kod, x.ad]), [['C-DEN-1', 'Deneme Cari 1 yeni']]);
    kopru.ambarlar = [];
    assert.equal((await kos()).tur, 'okuma');
    assert.equal(await sayi('logo_ambar'), 2, 'boş cevap önbelleği silmez');
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'));
  });

  test('LOGO-O10 cari ve ambar: 401\'de tur düşmez ve önbellek değişmez', async () => {
    await ayar('logo.liste-okumasi', true);
    kopru.cariListesi = [{ code: 'C-DEN-1' }];
    const bellek = yeniSurecBellegi();
    assert.equal((await listeOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    simdi += LISTE_TAZELEME_MS + 1000;
    kopru.senaryo = 'yetkisiz';
    assert.deepEqual(await listeOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'cari', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(await sayi('logo_cari'), 1);
  });

  test('LOGO-O11 fatura: yalnız Logo\'ya gitmiş ve numarası bilinen siparişler, sıralı ve turda sınırlı sayıda; tekrar okumada çift satır yok', async () => {
    await ayar('logo.fatura-okumasi', true);
    const toplam = FATURA_TUR_SINIRI + 2;
    for (let i = 1; i <= toplam; i += 1) {
      await vt().sorgu(
        `INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', $1, 1, now(), 'gonderildi', $2)`, [i, String(500 + i)]);
      await vt().sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2)', [i, `SP-DEN-${i}`]);
      if (i !== 2) kopru.faturalar.set(`SP-DEN-${i}`, [{ logicalRef: 900 + i, number: `FT-${i}` }, { logicalRef: 950 + i, number: `FT-${i}B` }]);
    }
    // Hiç gönderilmemiş, numarası olmayan ve hatalı sipariş okunmaz.
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', 99, 1, now(), 'gonderildi', '999')`);
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, niyet_zamani) VALUES ('siparis', 98, now())`);
    await vt().sorgu(`INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES (98, 'SP-DEN-98')`);
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => faturaTuru(vt(), ortami(bellek));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'fatura', sonuc: 'okundu', sayi: (FATURA_TUR_SINIRI - 1) * 2 }, 'sipariş 2\'nin faturası yok (404 = boş)');
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), Array.from({ length: FATURA_TUR_SINIRI }, (_, i) => `GET /api/PurchaseOrder/SP-DEN-${i + 1}/invoices`));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'fatura', sonuc: 'okundu', sayi: 4 }, 'kalan iki sipariş');
    assert.equal(istekSayisi(), toplam);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'hepsi taze okundu');
    assert.equal(await sayi('logo_fatura'), (toplam - 1) * 2);
    // Bir saat sonra aynı faturalar yeniden okunur; çift satır açılmaz.
    simdi += FATURA_YENIDEN_OKUMA_MS + 1000;
    assert.equal((await kos()).tur, 'okuma');
    assert.equal(await sayi('logo_fatura'), (toplam - 1) * 2);
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'));
    assert.equal(await sayi('logo_giden'), toplam + 2, 'okuma giden kutusunu değiştirmez');
  });

  test('LOGO-O12 fatura: 401\'de tur ilk istekte durur, iş düşmez, bekleme dolmadan yinelenmez', async () => {
    await ayar('logo.fatura-okumasi', true);
    for (let i = 1; i <= 3; i += 1) {
      await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', $1, 1, now(), 'gonderildi', $2)`, [i, String(500 + i)]);
      await vt().sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2)', [i, `SP-DEN-${i}`]);
    }
    kopru.senaryo = 'yetkisiz';
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await faturaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'fatura', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await faturaTuru(vt(), ortami(bellek)), { tur: 'bos' });
    assert.equal(istekSayisi(), 1);
    assert.equal(await sayi('logo_fatura'), 0);
    assert.equal(await sayi('logo_fatura_okuma'), 0, 'başarısız okuma okunmuş sayılmaz');
  });

  test('LOGO-O13 malzeme fişi: kapalıyken istek yok; açıkken niyet, sonra doğru uç ve gövde; çift gönderim yok; sonuç kaynağa yazılır', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const sarf = fisEkle('sarf-fisi');
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek));
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: sarf.id });
    assert.equal(istekSayisi(), 0, 'niyet turunda istek yok');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: sarf.id, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['POST /api/MaterialSlip/AddConsumption']);
    assert.equal((kopru.malzemeFisleri[0]?.govde as { TYPE?: number }).TYPE, 12);
    assert.equal((kopru.malzemeFisleri[0]?.govde as { NUMBER?: string }).NUMBER, sarf.no);
    assert.equal(fisler.get(`sarf-fisi:${sarf.id}`)?.kayitNo, String(kopru.malzemeFisleri[0]?.ref));
    assert.deepEqual(await kos(), { tur: 'bos' }, 'gönderilen fiş kuyruktan çıkar');
    assert.equal(kopru.malzemeFisleri.length, 1);
    const g = await vt().tek<{ son_sonuc: string; logo_kayit_no: string; niyet: boolean }>(
      "SELECT son_sonuc, logo_kayit_no, niyet_zamani IS NOT NULL AS niyet FROM logo_malzeme_fisi_giden WHERE belge_turu = 'sarf-fisi' AND belge_no = $1", [sarf.id]);
    assert.deepEqual(g, { son_sonuc: 'gonderildi', logo_kayit_no: String(kopru.malzemeFisleri[0]?.ref), niyet: false });
    // Üretimden giriş kendi ucuna gider.
    const uretim = fisEkle('uretim-girisi');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: uretim.id });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: uretim.id, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.at(-1)?.yol, '/api/MaterialSlip/AddProductionEntry');
    assert.equal((kopru.malzemeFisleri[1]?.govde as { TYPE?: number }).TYPE, 13);
    assert.equal(kopru.malzemeFisleri.length, 2);
  });

  test('LOGO-O14 malzeme fişi: sonucu bilinmeyen istek kendiliğinden yinelenmez (zaman aşımı); gövdesi bozuk fiş hiç gitmez', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const bozuk = fisEkle('sarf-fisi', { satirlar: [] });
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malzemeFisiTuru(vt(), fisOrtami(bellek)), { tur: 'malzeme-fisi', no: bozuk.id, sonuc: 'reddedildi' });
    assert.equal(istekSayisi(), 0);
    assert.match(fisler.get(`sarf-fisi:${bozuk.id}`)?.hata ?? '', /satırı yok/);
    fisler.clear();
    const fis = fisEkle('sarf-fisi');
    kopru.senaryo = 'zaman-asimi';
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek, ZAMAN_ASIMI_SURESI_MS));
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'belirsiz' });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'belirsiz bekleme dolmadan istek yok');
    simdi += BELIRSIZ_BEKLEME_MS + 1000;
    kopru.senaryo = 'basari';
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'reddedildi' });
    assert.match(fisler.get(`sarf-fisi:${fis.id}`)?.hata ?? '', /Logo'da kontrol/);
    assert.equal(istekSayisi(), 1, 'sonucu bilinmeyen fiş ikinci kez gönderilmedi');
    assert.equal(kopru.malzemeFisleri.length, 0);
  });

  test('LOGO-O15 malzeme fişi: 401 ve ağ hatasında tur düşmez; neden fişin sahibine yazılır, niyet boşalır', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const fis = fisEkle('uretim-girisi');
    const bellek = yeniSurecBellegi();
    kopru.senaryo = 'yetkisiz';
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek));
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'yetkisiz' });
    assert.match(fisler.get(`uretim-girisi:${fis.id}`)?.hata ?? '', /anahtarı reddedildi/);
    assert.equal(fisler.get(`uretim-girisi:${fis.id}`)?.kayitNo, null);
    assert.equal((await vt().tek<{ niyet: boolean }>("SELECT niyet_zamani IS NOT NULL AS niyet FROM logo_malzeme_fisi_giden WHERE belge_turu = 'uretim-girisi'"))?.niyet, false);
    // Köprü düzelince, geri çekilme dolunca fiş yeniden niyetle başlar ve bir kez gider.
    kopru.senaryo = 'basari';
    simdi += 31 * 60_000;
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'gonderildi' });
    assert.equal(kopru.malzemeFisleri.length, 1);
    // Ağ hatası: köprü kapalı.
    const ikinci = fisEkle('sarf-fisi');
    const adres = kopru.adres;
    await kopru.kapat();
    const o: MalzemeFisiTurOrtami = { ...fisOrtami(yeniSurecBellegi()), kopru: kopruIstemcisiKur({ adres, anahtar: 'x' }, { sureMs: 2000 }) };
    assert.equal((await malzemeFisiTuru(vt(), o)).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await malzemeFisiTuru(vt(), o), { tur: 'malzeme-fisi', no: ikinci.id, sonuc: 'ulasilamadi' });
  });

  test('LOGO-O17 stok akışı (294 c, 298 a): değişen fiş sıraya girer, aynı değişiklik iki kez sayılmaz; otomatik gider, kapalı gitmez, elle yalnız istekle; fire kapalıyken sarfa eklenir', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), { ...ortami(bellek), kaynak: stokKaynagi });

    stokDegistir(101, { satirlar: [{ stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '3' }] });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: 101 });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: 101, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['POST /api/MaterialSlip/AddConsumption']);
    assert.equal((kopru.malzemeFisleri[0]?.govde as { NUMBER?: string }).NUMBER, 'UE-DEN-101');
    assert.deepEqual(await kos(), { tur: 'bos' }, 'örtüşme penceresinde yeniden okunan değişiklik fişi yeniden sıraya almaz');
    assert.equal((await durum(101)).durum, 'gonderildi');

    // Fire kapalı (varsayılan): fire fişi gitmez, satırı emrin sarf fişine girer; sarf Logo'da silinip aynı numarayla açılır.
    stokDegistir(102, { tur: 'fire', satirlar: [{ stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '0.5' }] });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: 101, sonuc: 'silindi' });
    assert.equal(kopru.istekler.at(-1)?.yol, '/api/MaterialSlip/Consumption/UE-DEN-101');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: 101 });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: 101, sonuc: 'gonderildi' });
    assert.deepEqual((kopru.malzemeFisleri.at(-1)?.govde as { TRANSACTIONS?: { QUANTITY: number }[] }).TRANSACTIONS?.map((x) => x.QUANTITY), [3, 0.5]);
    assert.deepEqual(await kos(), { tur: 'bos' });
    assert.equal((await durum(102)).durum, 'gonderilmez');
    assert.ok(kopru.malzemeFisleri.every((f) => f.uc !== 'AddScrap'), 'fire fişi kendi ucuna gitmedi');

    // Sayım eksiği: kapalıyken gitmez; elle yapılınca istek olmadan gitmez, "Gönder" isteğiyle bir kez gider.
    stokDegistir(103, { tur: 'sayim_eksigi', no: 'SE-000103', uretimEmriId: null, satirlar: [{ stokKodu: 'HM-DEN-00002', birim: 'adet', miktar: '2' }] });
    assert.deepEqual(await kos(), { tur: 'bos' });
    assert.equal((await durum(103)).durum, 'gonderilmez');
    await ayar('logo.malzeme-fisi-sayim-eksigi', 'elle');
    assert.deepEqual(await kos(), { tur: 'bos' }, 'elle türde istek yok');
    assert.deepEqual([(await durum(103)).durum, (await durum(103)).gonderimSekli], ['bekliyor', 'elle']);
    stokDegistir(103, { istek: new Date(stokSaati).toISOString() });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: 103 });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: 103, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.at(-1)?.yol, '/api/MaterialSlip/AddCountShortage');
    assert.equal((kopru.malzemeFisleri.at(-1)?.govde as { TYPE?: number }).TYPE, 51);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'istek bir kez gider');
    assert.equal((await durum(103)).durum, 'gonderildi');
    const g = await vt().tek<{ istek: boolean }>("SELECT istek_bekliyor AS istek FROM logo_malzeme_fisi_giden WHERE belge_turu = 'sayim-eksigi' AND belge_no = 103");
    assert.equal(g?.istek, false);
  });

  test('LOGO-O18 artımlı fiş (233): değişen fiş silinip aynı numarayla açılır, sıfırda silinir; silme reddinde fiş Logo\'da kalır; hatalı fiş "Yeniden gönder" ile beklemeden gider', async () => {
    const ID = 201;
    const giris = (miktar: string | null) => stokDegistir(ID, {
      tur: 'uretim_girisi', no: 'UE-ART-201', satirlar: miktar === null ? [] : [{ stokKodu: 'MM-DEN-00002', birim: 'adet', miktar }],
    });
    const satir = async () => vt().tek<{ bekleyen: number; ozet: string | null; kayit: string | null; sonuc: string | null }>(
      "SELECT bekleyen_degisiklik AS bekleyen, son_satir_ozeti AS ozet, logo_kayit_no AS kayit, son_sonuc AS sonuc FROM logo_malzeme_fisi_giden WHERE belge_turu = 'uretim-girisi' AND belge_no = $1",
      [ID]);
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), { ...ortami(bellek), kaynak: stokKaynagi });

    giris(null);
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-kapali' }, 'ana anahtar kapalıyken istek yok');
    await ayar('logo.malzeme-fisi-gonderimi', true);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'boş fiş Logo\'ya gitmez');
    assert.equal(istekSayisi(), 0);

    giris('3');
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'gonderildi' });
    giris('4');
    giris('4');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'silindi' });
    assert.equal(`${kopru.istekler.at(-1)?.yontem} ${kopru.istekler.at(-1)?.yol}`, 'DELETE /api/MaterialSlip/ProductionEntry/UE-ART-201');
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet', 'yeniden açma kalkanla');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'gonderildi' });
    assert.equal((await satir())?.bekleyen, 0);
    const once = istekSayisi();
    giris('4');
    assert.deepEqual(await kos(), { tur: 'bos' }, 'satırları değişmeyen fiş istek göndermez');
    assert.equal(istekSayisi(), once);

    // Silme reddedilirse fiş Logo'da kalır, kayıt no durur; stoğa hata görünür; geri çekilme dolunca silinir.
    giris(null);
    kopru.senaryo = 'dogrulama';
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'reddedildi' });
    assert.ok((await satir())?.kayit !== null, 'fiş Logo\'da duruyor');
    assert.equal((await durum(ID)).durum, 'hata');
    assert.deepEqual(await kos(), { tur: 'bos' }, 'geri çekilme dolmadan istek yok');
    kopru.senaryo = 'basari';
    simdi += 31 * 60_000;
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'silindi' });
    assert.deepEqual(await kos(), { tur: 'bos' }, 'boş fiş istek göndermeden eşitlenir');
    assert.deepEqual(await satir(), { bekleyen: 0, ozet: null, kayit: null, sonuc: 'silindi' });
    assert.equal((await durum(ID)).durum, 'gonderilmez', 'Logo\'da yok, satırı yok');

    // Açma reddedilir; "Yeniden gönder" (stokta istek) geri çekilmeyi beklemeden yeniden dener.
    giris('1');
    kopru.senaryo = 'dogrulama';
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'reddedildi' });
    assert.equal((await durum(ID)).durum, 'hata');
    kopru.senaryo = 'basari';
    assert.deepEqual(await kos(), { tur: 'bos' }, 'geri çekilme sürüyor');
    stokDegistir(ID, { istek: new Date(stokSaati).toISOString() });
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: ID, sonuc: 'gonderildi' });
    assert.equal((await durum(ID)).durum, 'gonderildi');
  });

  test('LOGO-O20 gerçek stok akışıyla: imleç ilerler, yeni fiş sıraya girer, imleçten eski ve hiç değişmemiş fiş gönderilmez görünür', async () => {
    await vt().sorgu('DELETE FROM stok_malzeme_fisi_hareketi');
    await vt().sorgu('DELETE FROM stok_malzeme_fisi');
    const ac = async (emir: number, tur: 'sarf' | 'uretim_girisi'): Promise<number> =>
      (await vt().tek<{ id: number }>('INSERT INTO stok_malzeme_fisi (tur, uretim_emri_id, degisiklik) VALUES ($1, $2, 1) RETURNING id', [tur, emir]))!.id;
    const eski = await ac(9001, 'sarf');
    await vt().sorgu('UPDATE logo_malzeme_fisi_imleci SET zaman = now(), fis_id = $1, en_buyuk_fis_id = $1', [eski]);
    await vt().sorgu("UPDATE stok_malzeme_fisi SET degisiklik_zamani = now() - interval '1 hour' WHERE id = $1", [eski]);
    const yeni = await ac(9002, 'uretim_girisi');
    const kaynaklar: StokFisKaynaklari = { degisiklikler: malzemeFisiDegisiklikleri, fisler: logoIcinMalzemeFisleri, emirFisleri: emirlerinMalzemeFisleri };
    assert.equal(await vt().tx((db) => fisDegisiklikleriniAl(db, kaynaklar)), 1);
    assert.equal(await vt().tx((db) => fisDegisiklikleriniAl(db, kaynaklar)), 1, 'örtüşme penceresi yeniden okur');
    const satirlar = await vt().sorgu<{ k: string; bekleyen: number }>(
      "SELECT belge_turu || ':' || belge_no AS k, bekleyen_degisiklik AS bekleyen FROM logo_malzeme_fisi_giden ORDER BY 1");
    assert.deepEqual(satirlar, [{ k: `uretim-girisi:${yeni}`, bekleyen: 1 }], 'aynı değişiklik bir kez sayıldı; eski fiş girmedi');
    const imlec = await vt().tek<{ fis: number; enb: number }>('SELECT fis_id AS fis, en_buyuk_fis_id AS enb FROM logo_malzeme_fisi_imleci');
    assert.deepEqual(imlec, { fis: yeni, enb: yeni });
    const d = await vt().tx((db) => malzemeFisiLogoDurumlari(db, [
      { id: eski, tur: 'sarf', uretimEmriId: 9001, degisiklik: 1, gonderimIstegi: null, satirVar: true },
    ]));
    assert.equal(d.get(eski)?.durum, 'gonderilmez');
    await vt().sorgu('DELETE FROM stok_malzeme_fisi');
  });
});
