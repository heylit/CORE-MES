import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import {
  belgeStokKodlari, cariKaydiniAyikla, cariListesiniAyikla, logoKodlarinaCevir, malzemeKartlariniAyikla, sayfaliOkumaSirasi,
  stokToplamlariniAyikla,
} from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import {
  logoCariAra, logoCariOku, logodakiMalzemeKartlari, logodakiStokToplamlari, malzemeEslemesiYaz, malzemeKartiOkumaTuru, stokOkumaTuru, tmiStokKodlari,
  yeniSurecBellegi,
} from './servis.ts';
import type { TurOrtami } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('Logo\'dan okuma ayıklayıcıları ve kod eşlemesi kuralları (2116, 2118)', () => {
  test('LGC-1 malzeme kartı sayfası: kaydı ya da kodu olmayan satır atlanır; bozuk zarf ve geçersiz imleç null', () => {
    const s = malzemeKartlariniAyikla({
      data: [
        { logicalRef: 7, code: ' LG-1 ', name: 'Bir', name3: 'Uc', name4: null, cardType: 10, unitSetCode: '06', active: true },
        { logicalRef: 8, code: 'LG-2', active: false },
        { code: 'KAYITSIZ' },
        { logicalRef: 9 },
        'metin',
      ],
      next: 8,
    });
    assert.deepEqual(s, {
      kayitlar: [
        { logoKayitNo: 7, kod: 'LG-1', ad: 'Bir', aciklama2: 'Uc', aciklama3: null, kartTuru: 10, birimSeti: '06', aktif: true },
        { logoKayitNo: 8, kod: 'LG-2', ad: null, aciklama2: null, aciklama3: null, kartTuru: null, birimSeti: null, aktif: false },
      ],
      sonraki: 8,
    });
    assert.deepEqual(malzemeKartlariniAyikla({ data: [], next: null }), { kayitlar: [], sonraki: null });
    assert.equal(malzemeKartlariniAyikla([{ logicalRef: 1, code: 'X' }]), null, 'zarf yok');
    assert.equal(malzemeKartlariniAyikla({ data: [], next: -1 }), null, 'negatif imleç');
    assert.equal(malzemeKartlariniAyikla({ data: [], next: '5' }), null, 'metin imleç');
  });

  test('LGC-2 stok sayfası: miktar metin olarak tutulur; ambarı ya da miktarı olmayan satır atlanır', () => {
    assert.deepEqual(stokToplamlariniAyikla({
      data: [
        { itemCode: 'LG-1', warehouseNr: 0, onHand: 12.5 },
        { itemCode: 'LG-1', warehouseNr: 3, onHand: -2 },
        { itemCode: 'LG-2', onHand: 1 },
        { itemCode: 'LG-3', warehouseNr: 1 },
        { warehouseNr: 1, onHand: 1 },
      ],
      next: null,
    }), {
      kayitlar: [{ malzemeKodu: 'LG-1', ambarNo: 0, miktar: '12.5' }, { malzemeKodu: 'LG-1', ambarNo: 3, miktar: '-2' }],
      sonraki: null,
    });
  });

  test('LGC-3 cari: adres iki satırdan birleşir, boş alan null; dizi değilse liste null', () => {
    const c = cariKaydiniAyikla({
      logicalRef: 42, code: '120.01', name: 'Deneme Ticaret', cardType: 3, taxNr: '1234567890', address1: 'Sokak 1', address2: 'Kat 2', city: 'Ankara', active: true,
    });
    assert.deepEqual(c, {
      logoKayitNo: 42, kod: '120.01', ad: 'Deneme Ticaret', kartTuru: 3, vergiNo: '1234567890', tcKimlikNo: null, vergiDairesi: null,
      adres: 'Sokak 1 Kat 2', ilce: null, il: 'Ankara', postaKodu: null, telefon: null, ePosta: null, aktif: true,
    });
    assert.equal(cariKaydiniAyikla({ code: 'KAYITSIZ' }), null);
    assert.deepEqual(cariListesiniAyikla([{ logicalRef: 1, code: 'A' }, { name: 'kodsuz' }])?.map((x) => x.kod), ['A']);
    assert.equal(cariListesiniAyikla({ data: [] }), null);
  });

  test('LGC-4 sayfalı okuma sırası (3077 a): yarım tur devam eder; tam turdan sonra yalnız istekle baştan, istek yoksa beklenir', () => {
    const once = new Date('2026-11-05T10:00:00Z');
    assert.equal(sayfaliOkumaSirasi(null), 'bastan');
    assert.equal(sayfaliOkumaSirasi({ sonRef: 0, sonTamam: null, turIstendi: false }), 'bastan', 'hiç bitmiş tur yok');
    assert.equal(sayfaliOkumaSirasi({ sonRef: 500, sonTamam: null, turIstendi: false }), 'devam');
    assert.equal(sayfaliOkumaSirasi({ sonRef: 500, sonTamam: once, turIstendi: true }), 'devam', 'istek yarım turu kesmez');
    assert.equal(sayfaliOkumaSirasi({ sonRef: 0, sonTamam: once, turIstendi: false }), 'bekle', 'süre geçse de kendiliğinden okumaz');
    assert.equal(sayfaliOkumaSirasi({ sonRef: 0, sonTamam: once, turIstendi: true }), 'bastan');
  });

  test('LGC-5 kod çevirisi: yalnız eşlemesi olan kod değişir; olmayan alan eklenmez; başka alana dokunulmaz', () => {
    const harita = new Map([['HM-AAA-00001', 'LG.EK.1']]);
    const belge = {
      no: 'S-1', stokKodu: 'HM-AAA-00001',
      satirlar: [{ stokKodu: 'HM-AAA-00001', miktar: '1' }, { stokKodu: 'HM-BBB-00002', miktar: '2' }, { stokKodu: null, miktar: '3' }, { miktar: '4' }],
    };
    assert.deepEqual(belgeStokKodlari(belge), ['HM-AAA-00001', 'HM-BBB-00002']);
    const yeni = logoKodlarinaCevir(belge, harita);
    assert.deepEqual(yeni, {
      no: 'S-1', stokKodu: 'LG.EK.1',
      satirlar: [{ stokKodu: 'LG.EK.1', miktar: '1' }, { stokKodu: 'HM-BBB-00002', miktar: '2' }, { stokKodu: null, miktar: '3' }, { miktar: '4' }],
    });
    assert.equal(belge.stokKodu, 'HM-AAA-00001', 'girdi değişmez');
    assert.equal(logoKodlarinaCevir(belge, new Map()), belge);
    assert.equal('stokKodu' in logoKodlarinaCevir({ satirlar: [] }, harita), false);
  });
});

describe('Logo\'dan malzeme kartı, stok ve cari okuması, sahte köprüyle (2116, 2118; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kopru: SahteKopru;
  let simdi = Date.parse('2026-11-05T10:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const ortami = (bellek = yeniSurecBellegi()): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek, saat: () => new Date(simdi),
  });
  const kodlar = async (): Promise<string[]> => (await vt().tx((db) => logodakiMalzemeKartlari(db, { sinir: 100, sonra: 0 }))).map((k) => k.kod);
  const yazmaIstegiYok = (): void => {
    assert.deepEqual(kopru.istekler.filter((i) => i.yontem !== 'GET'), [], 'Logo\'ya yazma isteği yok');
  };
  // 3077 a: yeniden okuma yalnız "Şimdi oku" ile; sayfadaki düğmenin ucu.
  const simdiOku = async (c = cerez): Promise<number> =>
    (await app.inject({ method: 'POST', url: '/api/logo-gecisi/oku', headers: { cookie: c, 'istek-kimligi': randomUUID() }, payload: {} })).statusCode;
  const gecisiBitir = async (c = cerez): Promise<number> =>
    (await app.inject({ method: 'POST', url: '/api/logo-gecisi/bitir', headers: { cookie: c, 'istek-kimligi': randomUUID() }, payload: {} })).statusCode;
  const kart = (ref: number, kod: string, ek: Record<string, unknown> = {}): Record<string, unknown> => ({ logicalRef: ref, code: kod, name: `Ad ${kod}`, ...ek });

  before(async () => {
    ortam = await testVeritabaniKur('logocekme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Cekme', kullaniciAdi: 'lc-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lc-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    simdi += 24 * 3600_000;
    for (const t of ['logo_malzeme_karti', 'logo_stok_toplami', 'logo_okuma_imleci']) await vt().sorgu(`DELETE FROM ${t}`);
    for (const a of ['logo.malzeme-okumasi', 'logo.stok-okumasi', 'logo.cari-aramasi']) await ayar(a, false);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LGC-6 yeni anahtarlar kapalı gelir; kapalıyken, bağlantı kapalıyken ya da köprü yokken istek ve yazma yok; işler "bekliyor" döner', async () => {
    kopru.logoKartlari.push(kart(1, 'LG-1'));
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami()), { tur: 'malzeme-karti-kapali' });
    assert.deepEqual(await stokOkumaTuru(vt(), ortami()), { tur: 'stok-kapali' });
    const cari = await logoCariAra(vt(), ortami().kopru, 'Deneme');
    assert.equal(cari.tur, 'kapali');
    assert.match(cari.tur === 'kapali' ? cari.ileti : '', /Sistem Ayarları/);
    for (const ad of ['logo-malzeme-karti-okumasi', 'logo-stok-okumasi']) {
      const is = isler.find((i) => i.ad === ad);
      assert.ok(is, `${ad} iş listesinde yok`);
      assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor');
    }
    for (const a of ['logo.malzeme-okumasi', 'logo.stok-okumasi', 'logo.cari-aramasi']) await ayar(a, true);
    await ayar('logo.baglanti', false);
    try {
      assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami()), { tur: 'kapali' });
      assert.deepEqual(await stokOkumaTuru(vt(), ortami()), { tur: 'kapali' });
      assert.equal((await logoCariAra(vt(), ortami().kopru, 'Deneme')).tur, 'kapali');
      assert.equal((await logoCariOku(vt(), ortami().kopru, 'C-1')).tur, 'kapali');
    } finally {
      await ayar('logo.baglanti', true);
    }
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await stokOkumaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.equal((await logoCariAra(vt(), null, 'Deneme')).tur, 'ortam-degiskeni-yok');
    assert.equal(kopru.istekler.length, 0);
    assert.deepEqual(await kodlar(), []);
  });

  test('LGC-7 malzeme kartı: sayfa sayfa, turda tek istek; tam tur bitince istek olmadan yeniden okunmaz (3077 a); sonraki turda Logo\'dan silinen kart aynadan düşer', async () => {
    await ayar('logo.malzeme-okumasi', true);
    kopru.sayfaBoyu = 2;
    kopru.logoKartlari.push(kart(1, 'LG-1'), kart(2, 'LG-2'), kart(3, 'LG-3', { active: false }));
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'malzeme-karti', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'malzeme-karti', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual(kopru.istekler.map((i) => i.yol), ['/api/Material/list', '/api/Material/list'], 'ikinci sayfa imleçle: LG-3 ikinci istekte geldi');
    assert.deepEqual(await kodlar(), ['LG-1', 'LG-2', 'LG-3']);
    assert.equal((await vt().tx((db) => logodakiMalzemeKartlari(db, { kodlar: ['LG-3'], sinir: 10, sonra: 0 })))[0]?.aktif, false);
    // Tam tur bitti: gün geçse de istek olmadan Logo'ya gidilmez.
    simdi += 7 * 24 * 3600_000;
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'bos' });
    assert.equal(kopru.istekler.length, 2);
    // "Şimdi oku": LG-2 Logo'da silindi, LG-1'in adı değişti; yeni tur bitince aynada yalnız görülenler kalır.
    simdi += 60_000;
    assert.equal(await simdiOku(), 200);
    kopru.logoKartlari.splice(1, 1);
    kopru.logoKartlari[0] = kart(1, 'LG-1', { name: 'Yeni ad' });
    assert.equal((await malzemeKartiOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.deepEqual(await kodlar(), ['LG-1', 'LG-2', 'LG-3'], 'son sayfaya kadar silme yok');
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'malzeme-karti', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(await kodlar(), ['LG-1', 'LG-3'], 'son sayfada turda görülmeyen kart düşer');
    assert.equal((await vt().tx((db) => logodakiMalzemeKartlari(db, { kodlar: ['LG-1'], sinir: 10, sonra: 0 })))[0]?.ad, 'Yeni ad');
    yazmaIstegiYok();
  });

  test('LGC-8 malzeme kartı: boş tam tur aynayı boşaltmaz; 401de yazma yok, imleç ilerlemez, bekleme dolmadan yinelenmez', async () => {
    await ayar('logo.malzeme-okumasi', true);
    kopru.logoKartlari.push(kart(1, 'LG-1'));
    const bellek = yeniSurecBellegi();
    assert.equal((await malzemeKartiOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    simdi += 60_000;
    assert.equal(await simdiOku(), 200);
    kopru.logoKartlari.length = 0;
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'malzeme-karti', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(await kodlar(), ['LG-1'], 'okuma kazası olabilecek boş tur aynayı silmez');
    simdi += 60_000;
    assert.equal(await simdiOku(), 200);
    kopru.senaryo = 'yetkisiz';
    const once = kopru.istekler.length;
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'malzeme-karti', sonuc: 'yetkisiz', sayi: 0 });
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'bos' }, 'başarısız okuma hemen yinelenmez');
    assert.equal(kopru.istekler.length, once + 1);
    assert.deepEqual(await kodlar(), ['LG-1']);
    yazmaIstegiYok();
  });

  test('LGC-9 stok: malzeme sayfasıyla aynı imleç; ambar başına miktar metin olarak yazılır, Logo\'da sıfırlanan satır son sayfada düşer', async () => {
    await ayar('logo.stok-okumasi', true);
    kopru.sayfaBoyu = 1;
    kopru.logoKartlari.push(kart(5, 'LG-5'), kart(6, 'LG-6'));
    kopru.logoStoklari.push(
      { itemRef: 5, itemCode: 'LG-5', warehouseNr: 0, onHand: 10.25 },
      { itemRef: 5, itemCode: 'LG-5', warehouseNr: 1, onHand: 3 },
      { itemRef: 6, itemCode: 'LG-6', warehouseNr: 0, onHand: 7 },
    );
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await stokOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'stok', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await stokOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'stok', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual(await stokOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'stok', sonuc: 'okundu', sayi: 0 });
    assert.equal(kopru.istekler.filter((i) => i.yol === '/api/Stock/totals').length, 3);
    const oku = () => vt().tx((db) => logodakiStokToplamlari(db, ['LG-5', 'LG-6']));
    assert.deepEqual((await oku()).map((x) => [x.malzemeKodu, x.ambarNo, x.miktar]), [['LG-5', 0, '10.25'], ['LG-5', 1, '3'], ['LG-6', 0, '7']]);
    simdi += 60_000;
    assert.equal(await simdiOku(), 200);
    kopru.sayfaBoyu = 500;
    kopru.logoStoklari.splice(1, 1);
    assert.equal((await stokOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.deepEqual((await oku()).map((x) => [x.malzemeKodu, x.ambarNo]), [['LG-5', 0], ['LG-6', 0]]);
    yazmaIstegiYok();
  });

  test('LGC-10 cari arama: açıkken yalnız GET; kod, unvan ve vergi noyla bulur; kısa metin reddedilir ve istek atılmaz; olmayan cari null', async () => {
    await ayar('logo.cari-aramasi', true);
    kopru.logoCarileri.push(
      { logicalRef: 1, code: '120.01', name: 'Deneme Ticaret', taxNr: '1111111111', cardType: 1 },
      { logicalRef: 2, code: '320.07', name: 'Ornek Tedarik', taxNr: '2222222222', cardType: 2 },
      { logicalRef: 3, code: '320.08', name: 'Kapali Firma', active: false },
    );
    const k = ortami().kopru;
    await assert.rejects(logoCariAra(vt(), k, ' ab '), (h: Error & { kod?: string }) => h.kod === 'GECERSIZ');
    assert.equal(kopru.istekler.length, 0);
    const kodlari = async (q: string) => {
      const r = await logoCariAra(vt(), k, q);
      assert.equal(r.tur, 'tamam');
      return r.tur === 'tamam' ? r.veri.map((c) => c.kod) : [];
    };
    assert.deepEqual(await kodlari('ticaret'), ['120.01']);
    assert.deepEqual(await kodlari('320'), ['320.07'], 'kullanım dışı cari gelmez');
    assert.deepEqual(await kodlari('2222222222'), ['320.07']);
    const tek = await logoCariOku(vt(), k, '320.07');
    assert.equal(tek.tur === 'tamam' ? tek.veri?.ad : null, 'Ornek Tedarik');
    assert.deepEqual(await logoCariOku(vt(), k, 'YOK.1'), { tur: 'tamam', veri: null });
    kopru.senaryo = 'yetkisiz';
    assert.equal((await logoCariAra(vt(), k, 'Deneme')).tur, 'hata');
    yazmaIstegiYok();
  });

  test('LGC-11 kod eşlemesi: aynı kod yazılmaz; yazılan eşleme iki yönde okunur, değiştirilemez ve silinemez', async () => {
    const tmi = `HM-ESL-${String(simdi % 100000).padStart(5, '0')}`;
    const logo = `LG.ESL.${simdi}`;
    await vt().tx((db) => malzemeEslemesiYaz(db, { stokKodu: 'AYNI-1', logoKodu: ' AYNI-1 ', logoKayitNo: 90001 }));
    assert.equal(await vt().tek('SELECT 1 FROM logo_malzeme_eslemesi WHERE stok_kodu = $1', ['AYNI-1']), null, 'kod aynıysa eşleme gerekmez');
    await vt().tx((db) => malzemeEslemesiYaz(db, { stokKodu: tmi, logoKodu: logo, logoKayitNo: simdi }));
    assert.deepEqual([...(await vt().tx((db) => tmiStokKodlari(db, [logo, 'BASKA'])))], [[logo, tmi]]);
    await assert.rejects(vt().sorgu('UPDATE logo_malzeme_eslemesi SET logo_kodu = $2 WHERE stok_kodu = $1', [tmi, 'LG.BASKA']), /değişmez/);
    await assert.rejects(vt().sorgu('DELETE FROM logo_malzeme_eslemesi WHERE stok_kodu = $1', [tmi]), /değişmez/);
    await assert.rejects(vt().tx((db) => malzemeEslemesiYaz(db, { stokKodu: `${tmi}X`, logoKodu: logo, logoKayitNo: simdi + 1 })), 'Logo kodu tek kartla eşleşir');
  });

  test('LGC-12 aynada arama (2116g): kod, ad ve açıklama parçasıyla; Türkçe harf ve büyük/küçük harf farkı gözetilmez; % harf sayılır', async () => {
    const r = 970000;
    await vt().sorgu(
      `INSERT INTO logo_malzeme_karti (logical_ref, kod, ad, aciklama_2, aciklama_3, aktif, son_okuma) VALUES
         ($1, 'ARA.MIL.01', 'Çelik mil Ø20', NULL, NULL, true, now()),
         ($1 + 1, 'ARA.BURC.02', 'Pirinç burç', 'İŞLENMİŞ yüzey', NULL, true, now()),
         ($1 + 2, 'ARA.PUL.03', 'Pul', NULL, '%50 indirim', true, now())`,
      [r],
    );
    const ara = async (metin: string): Promise<string[]> =>
      (await vt().tx((db) => logodakiMalzemeKartlari(db, { ara: metin, sinir: 100, sonra: r - 1 }))).map((k) => k.kod);
    assert.deepEqual(await ara('mil.0'), ['ARA.MIL.01']);
    assert.deepEqual(await ara('celik'), ['ARA.MIL.01']);
    assert.deepEqual(await ara('islenmis'), ['ARA.BURC.02']);
    assert.deepEqual(await ara('%5'), ['ARA.PUL.03']);
    assert.deepEqual(await ara('ARA.'), ['ARA.MIL.01', 'ARA.BURC.02', 'ARA.PUL.03']);
    assert.deepEqual(await ara('yok-boyle'), []);
    assert.equal((await ara('  ')).length >= 3, true, 'boş arama süzmez');
  });
  test('LGC-13 geçiş okuması (3077 a, 3078 b): "Şimdi oku" iki okumayı açar ve baştan okutur; "Geçişi bitir" kapatır, kopya kalır; ayar yazma yetkisi ister', async () => {
    kopru.logoKartlari.push(kart(1, 'LG-1'));
    const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Malzemeci', kullaniciAdi: 'lc-malzemeci', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('lc_malzemeci', 'Malzemeci') ON CONFLICT DO NOTHING");
    await vt().sorgu(
      "INSERT INTO rol_islemi (rol_id, islem) SELECT id, i FROM rol, unnest(ARRAY['sayfa.logo-gecisi', 'malzemeler.yaz']) AS i WHERE kod = 'lc_malzemeci' ON CONFLICT DO NOTHING",
    );
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lc_malzemeci') WHERE kisi_id = $1", [kisiId]);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lc-malzemeci', parola: PAROLA } });
    const malzemeci = String(g.headers['set-cookie']).split(';')[0] ?? '';
    assert.equal(await simdiOku(malzemeci), 403, 'sayfayı gören ama ayar yazamayan okutamaz');
    assert.equal(await gecisiBitir(malzemeci), 403);
    const acik = (a: 'logo.malzeme-okumasi' | 'logo.stok-okumasi'): Promise<unknown> => vt().tx((db) => sistemAyariOku(db, a));

    await ayar('logo.baglanti', false);
    try {
      assert.equal(await simdiOku(), 422, 'bağlantı kapalıyken açılmaz');
      assert.notEqual(await acik('logo.malzeme-okumasi'), true);
    } finally {
      await ayar('logo.baglanti', true);
    }
    simdi += 60_000;
    assert.equal(await simdiOku(), 200);
    assert.equal(await acik('logo.malzeme-okumasi'), true);
    assert.equal(await acik('logo.stok-okumasi'), true);
    const bellek = yeniSurecBellegi();
    assert.equal((await malzemeKartiOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'bos' }, 'tam tur bitti, istek yok');
    assert.equal(await gecisiBitir(), 200);
    assert.notEqual(await acik('logo.malzeme-okumasi'), true);
    assert.notEqual(await acik('logo.stok-okumasi'), true);
    assert.deepEqual(await malzemeKartiOkumaTuru(vt(), ortami(bellek)), { tur: 'malzeme-karti-kapali' });
    assert.deepEqual(await kodlar(), ['LG-1'], 'geçiş bitince okunmuş kopya silinmez');
    assert.equal(await gecisiBitir(), 200, 'kapalıyken bitirmek hata değil');
    yazmaIstegiYok();
  });
});
