import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  sonrakiIstasyon,
  baslatmaEksikleri, buradakiIstasyon, istekGecisEngeli, enKotuKalite, girdiSec, sayimArtisPlani, sayimAzalisPlani, istekAcilisDurumu, istekliTeslimEngeli, teslimAlimMiktariEngeli, teslimAlmaEngeli, teslimKapanisEngeli, kisiKoduAyristir, kisiKoduEngeli, kisiKoduGovdesi, KISI_KODU_SURESI_SN,
  binde, bindenMetin, bolmeNo, cikisOnerisi, duzeltmeEngeli, dusumKarari, geriAlmaEngeli, gozKodu, ilkGirisBirlesik, kalanAmbalajAdedi, logoAmbari,
  logoEslesmeDurumu, logoyaGiderMi, malKabulGozOnerisi, malKabulSatirTuru, rotaSirala, partiDenetimi, partiGereksinimi, partiSec, rafGozleri, sayimBekliyorMu, sayimFarki, siparisMalzemeEngeli, stokDurumu, stoklanirMi, tersYon,
  ihtiyacToplami, kalanSarf, stokDegeri, tamamlamaEngeli, depoKoduOner, haritaPlani, istekListeEngeli, adimMiktarEngeli, istekKarsilamalari,
  kaynaklardanAl, uretimAdimPlani, rezerveSiniri, fasonGonderimiEksikMi, partiEtiketi, koduDegisenler,
  sevkAdediBinde, urunSevkAdimlari, elleSarfMahsubu, kaliteKarariHareketiMi, karantinaEngeli,
} from './kurallar.ts';

describe('stok kuralları (saf)', () => {
  test('94 a koduDegisenler: yalnız kodu değişip açık kalan konum yeniden basılır', () => {
    const k = (id: number, kod: string, aktif = true) => ({ id, kod, tur: 'raf_gozu' as const, ad: null, bolmeNo: 1, katNo: id, aktif });
    assert.deepEqual(koduDegisenler([k(1, 'A-01-01'), k(2, 'A-01-02'), k(3, 'A-01-03'), k(4, 'X-01')], [k(1, 'B-01-01'), k(2, 'B-01-02', false), k(3, 'A-01-03'), k(5, 'Y-01')]),
      [{ konumId: 1, eskiKod: 'A-01-01', yeniKod: 'B-01-01', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 1 }]);
  });
  test('STK-H1 açık hazırlık listesindeki istek tek başına teslim edilmez; liste kapanınca engel kalkar', () => {
    assert.equal(istekListeEngeli({ toplamaNo: null, toplamaDurumu: null }), null);
    assert.equal(istekListeEngeli({ toplamaNo: 'TL-000003', toplamaDurumu: 'bitti' }), null);
    assert.match(istekListeEngeli({ toplamaNo: 'TL-000003', toplamaDurumu: 'topluyor' })!, /TL-000003/);
  });
  test('STK-H2 adımda planlanandan azı kısmi toplanır; fazlası ve sıfır reddedilir', () => {
    assert.equal(adimMiktarEngeli('2.000', '2'), null);
    assert.equal(adimMiktarEngeli('2.000', '0.5'), null);
    assert.match(adimMiktarEngeli('2.000', '2.001')!, /en çok 2/);
    assert.notEqual(adimMiktarEngeli('2.000', '0'), null);
  });
  test('STK-H3 yolda teslimi olan isteğe ikinci teslim, listedeki isteğe tek teslim bağlanmaz', () => {
    const istek = { durum: 'acik' as const, malzemeId: 1, istasyonId: 7 };
    const teslim = { malzemeId: 1, hedefIstasyonId: 7, depoIslemi: true };
    assert.equal(istekliTeslimEngeli(istek, { ...teslim, yoldaVar: false }), null);
    assert.match(istekliTeslimEngeli(istek, { ...teslim, yoldaVar: true })!, /yolda/);
    assert.match(istekliTeslimEngeli({ ...istek, toplamaNo: 'TL-000004', toplamaDurumu: 'topluyor' }, teslim)!, /hazırlık listesinde/);
  });
  test('STK-H4 toplanan, aynı malzemenin isteklerine açılış sırasıyla dağıtılır; fazlası yazılmaz, kalmayan açık kalır', () => {
    const istekler = [{ id: 1, malzemeId: 9, miktar: '3' }, { id: 2, malzemeId: 9, miktar: '3' }, { id: 3, malzemeId: 9, miktar: '1' }, { id: 4, malzemeId: 8, miktar: '1' }];
    const k = istekKarsilamalari(istekler, new Map([[9, '4.5']]));
    assert.deepEqual([...k], [[1, '3'], [2, '1.5']]);
    assert.equal(k.has(3), false, 'kalmayan istek karşılanmaz');
    assert.equal(k.has(4), false, 'toplanmayan malzeme karşılanmaz');
    assert.deepEqual([...istekKarsilamalari(istekler.slice(0, 1), new Map([[9, '10']]))], [[1, '3']], 'istenenden fazlası yazılmaz');
  });
  test('STK-T1..T7 malzeme · teslim: açılış durumu, kapanış, alan taraf ve isteğe bağlı teslim', () => {
    assert.equal(istekAcilisDurumu('5.000', '5'), 'acik');
    assert.equal(istekAcilisDurumu('4.999', '5'), 'stok_yok');
    assert.equal(teslimKapanisEngeli('yolda'), null);
    assert.notEqual(teslimKapanisEngeli('teslim'), null);
    assert.notEqual(teslimAlmaEngeli(true, { tur: 'depo', depoIslemi: true }), null, 'gönderen alamaz');
    assert.equal(teslimAlmaEngeli(false, { tur: 'istasyon', kapsamda: true }), null);
    assert.notEqual(teslimAlmaEngeli(false, { tur: 'istasyon', kapsamda: false }), null);
    assert.notEqual(teslimAlmaEngeli(false, { tur: 'depo', depoIslemi: false }), null);
    assert.equal(teslimAlmaEngeli(false, { tur: 'istasyon', kapsamda: true }, true), 'Bu teslim başka bir kişiye geliyor.', 'STK-T8 kişiye teslim');
    const istek = { durum: 'stok_yok' as const, malzemeId: 1, istasyonId: 7 };
    const teslim = { malzemeId: 1, hedefIstasyonId: 7, depoIslemi: true };
    assert.equal(istekliTeslimEngeli(istek, teslim), null);
    assert.match(istekliTeslimEngeli(istek, { ...teslim, depoIslemi: false })!, /depo/);
    assert.match(istekliTeslimEngeli({ ...istek, durum: 'iptal' }, teslim)!, /kapandı/);
    assert.match(istekliTeslimEngeli(istek, { ...teslim, malzemeId: 2 })!, /malzeme/);
    assert.match(istekliTeslimEngeli({ ...istek, istasyonId: null }, teslim)!, /İstasyonsuz/);
    assert.match(istekliTeslimEngeli(istek, { ...teslim, hedefIstasyonId: 8 })!, /istasyonuna/);
    assert.equal(teslimAlimMiktariEngeli('5.000', '5', '5.000'), null);
    assert.match(teslimAlimMiktariEngeli('5.000', '5.001', '9')!, /fazla/);
    assert.match(teslimAlimMiktariEngeli('5.000', '5', '4.999')!, /Kaynakta/);
    assert.equal(buradakiIstasyon(4, [3, 4]), 4, 'açık iş kapsamda');
    assert.equal(buradakiIstasyon(9, [3, 4]), null, 'kapsam dışı açık iş seçilmez');
    assert.equal(buradakiIstasyon(null, [3]), 3, 'tek istasyon');
    assert.equal(buradakiIstasyon(null, []), null);
  });

  test('DEP-42 toplama rotası: önce rafsız konum, raflar sırayla, koridorda yılan, gözde kat yukarı', () => {
    const d = (konumKod: string, rafKod: string | null, bolmeNo: number | null, katNo: number | null) => ({ konumKod, rafKod, bolmeNo, katNo });
    const s = rotaSirala([d('B-01-01', 'B', 1, 1), d('A-02-01', 'A', 2, 1), d('KABUL', null, null, null), d('B-03-01', 'B', 3, 1), d('A-01-02', 'A', 1, 2), d('A-01-01', 'A', 1, 1)]);
    assert.deepEqual(s.map((x) => x.konumKod), ['KABUL', 'A-01-01', 'A-01-02', 'A-02-01', 'B-03-01', 'B-01-01']);
  });

  test('miktar binde tam sayıyla hesaplanır, ondalık hata payı olmaz', () => {
    assert.equal(binde('0.1') + binde('0.2'), binde('0.3'));
    assert.equal(bindenMetin(binde('12.500')), '12.5');
    assert.equal(bindenMetin(-binde('3')), '-3');
    assert.throws(() => binde('1.2345'));
  });

  test('DEP-14 raf adresi: Kod-Bölme-Kat; tek ve çift numaralama koridorun iki yüzü', () => {
    assert.equal(gozKodu('A', 3, 2), 'A-03-02');
    assert.deepEqual([0, 1, 2].map((k) => bolmeNo('tek', 1, k)), [1, 3, 5]);
    assert.deepEqual([0, 1, 2].map((k) => bolmeNo('cift', 1, k)), [2, 4, 6]);
    assert.deepEqual([0, 1].map((k) => bolmeNo('sirali', 7, k)), [7, 8]);
    const g = rafGozleri({ kod: 'B', numaralama: 'tek', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 2 });
    assert.deepEqual(g.map((x) => x.kod), ['B-01-01', 'B-01-02', 'B-03-01', 'B-03-02']);
    assert.equal(new Set(g.map((x) => x.kod)).size, g.length);
  });

  test('DEP-02/03/04 düşüm: yeterliyse yazılır; yetmezse onay ister; onayla eksi yazılır; yeterliyken onay yok sayılır', () => {
    assert.deepEqual(dusumKarari('5', '3', false), { tur: 'yaz', onayliEksi: false });
    assert.deepEqual(dusumKarari('5', '8', false), { tur: 'onay-gerekli', mevcut: '5' });
    assert.deepEqual(dusumKarari('5', '8', true), { tur: 'yaz', onayliEksi: true });
    assert.deepEqual(dusumKarari('5', '5', true), { tur: 'yaz', onayliEksi: false });
  });

  test('DEP-05/06/07/08 çıkış önerisi: en eski giriş önce, bölünebilir; fason, üretim çıkışı ve hurda dışında; bakiye yoksa veri yetersiz', () => {
    const s = (id: number, ilk: string, miktar: string, konumTur = 'raf_gozu') => ({ bakiyeId: id, konumId: id, konumKod: `K${id}`, konumTur, partiId: null, partiEtiketi: null, miktar, ilkGiris: ilk });
    const o = cikisOnerisi([s(1, '2026-10-05T10:00:00Z', '4'), s(2, '2026-10-01T10:00:00Z', '3'), s(3, '2026-09-01T10:00:00Z', '9', 'fason')], '5');
    assert.equal(o.yeterli, true);
    assert.deepEqual(o.oneriler.map((x) => [x.bakiyeId, x.miktar]), [[2, '3'], [1, '2']]);
    assert.equal(o.mevcut, '7');
    assert.deepEqual(cikisOnerisi([], '1'), { veriYetersiz: true, yeterli: false, mevcut: '0', oneriler: [] });
    assert.equal(cikisOnerisi([s(4, '2026-10-01T10:00:00Z', '-2')], '1').veriYetersiz, true);
    assert.equal(cikisOnerisi([s(5, '2026-10-01T10:00:00Z', '4', 'hurda')], '1').veriYetersiz, true, 'hurda öneriye girmez (#1304)');
    // Y1: üretim çıkışındaki parça başka emrindir; en eski olsa da önerilmez.
    const cikis = cikisOnerisi([s(5, '2026-09-01T10:00:00Z', '9', 'uretim_cikisi'), s(6, '2026-10-01T10:00:00Z', '2')], '3');
    assert.deepEqual(cikis.oneriler.map((x) => x.bakiyeId), [6]);
    assert.equal(cikis.mevcut, '2');
  });

  test('DEP-23/24 parti seçimi: tek parti kendiliğinden, birden çoksa seçim; partisiz satır partiyi uydurmaz', () => {
    assert.deepEqual(partiSec([7], undefined), { tur: 'tamam', partiId: 7, secim: 'tek_parti' });
    assert.deepEqual(partiSec([7, 8], undefined), { tur: 'secim-gerekli', partiler: [7, 8] });
    assert.deepEqual(partiSec([7, 8], 8), { tur: 'tamam', partiId: 8, secim: 'kisi' });
    assert.deepEqual(partiSec([null], undefined), { tur: 'tamam', partiId: null, secim: null });
  });

  test('DEP-20/48/49 parti türe göre: hammadde, yarı mamul ve mamul girişte lot alır (#1018); sarfta sertifika tek başına parti açmaz; demirbaş parti almaz', () => {
    assert.equal(partiGereksinimi('hammadde', 'mal_kabul'), 'lot');
    assert.equal(partiGereksinimi('sarf', 'mal_kabul'), 'lot');
    assert.equal(partiGereksinimi('mamul', 'uretim'), 'emir');
    assert.equal(partiGereksinimi('yarimamul', 'mal_kabul'), 'lot');
    assert.equal(partiGereksinimi('demirbas', 'mal_kabul'), 'yok');
    assert.equal(partiDenetimi('hammadde', 'mal_kabul', { parti: null }), null);
    assert.equal(partiDenetimi('hammadde', 'mal_kabul', { parti: { sertifikaNo: 'S1' } }), null);
    assert.equal(partiDenetimi('hammadde', 'mal_kabul', { parti: { dokumNo: 'D1' } }), null);
    assert.equal(partiDenetimi('sarf', 'mal_kabul', { parti: null }), null);
    assert.match(partiDenetimi('demirbas', 'mal_kabul', { parti: { tedarikciPartiNo: 'X' } }) ?? '', /Demirbaş/);
    assert.equal(partiDenetimi('mamul', 'mal_kabul', {}), null);
    assert.equal(partiDenetimi('sarf', 'mal_kabul', { parti: { sertifikaNo: 'S1' } }), null);
    assert.match(partiDenetimi('mamul', 'uretim', { parti: { sertifikaNo: 'S1' } }) ?? '', /Sertifika/);
  });

  test('DEP-09 taşımada ilk giriş ikisinin eskisi', () => {
    assert.equal(ilkGirisBirlesik('2026-10-05T10:00:00+03:00', '2026-10-01T10:00:00+03:00'), '2026-10-01T10:00:00+03:00');
  });

  test('DEP-27 ambalaj adedi miktarla orantılı azalır, kesir yukarı yuvarlanır', () => {
    assert.equal(kalanAmbalajAdedi(10, '100', '45'), 5);
    assert.equal(kalanAmbalajAdedi(10, '100', '41'), 5);
    assert.equal(kalanAmbalajAdedi(null, '100', '41'), null);
    assert.equal(kalanAmbalajAdedi(4, '10', '-2'), null);
  });

  test('DEP-28 kritik durum: tanımsızsa sayı uydurulmaz; eksi önce gelir', () => {
    assert.equal(stokDurumu('5', null), 'tanimsiz');
    assert.equal(stokDurumu('5', '5'), 'kritik');
    assert.equal(stokDurumu('6', '5'), 'yeterli');
    assert.equal(stokDurumu('-1', null), 'eksi');
  });

  test('DEP-15 sayım bekleyen: süre tanımlı değilse kural çalışmaz (null)', () => {
    assert.equal(sayimBekliyorMu(null, '2026-10-07T00:00:00Z', null), null);
    assert.equal(sayimBekliyorMu(null, '2026-10-07T00:00:00Z', 30), true);
    assert.equal(sayimBekliyorMu('2026-09-01T00:00:00Z', '2026-10-07T00:00:00Z', 30), true);
    assert.equal(sayimBekliyorMu('2026-09-20T00:00:00Z', '2026-10-07T00:00:00Z', 30), false);
  });

  test('DEP-16 sayım farkı yönü ve miktarı', () => {
    assert.deepEqual(sayimFarki('10', '12.5'), { tur: 'sayim_fazla', miktar: '2.5' });
    assert.deepEqual(sayimFarki('10', '7'), { tur: 'sayim_eksik', miktar: '3' });
    assert.deepEqual(sayimFarki('10', '10.000'), { tur: 'yok' });
  });

  test('DEP-17/18/19/53 geri alma engelleri ve ters yön', () => {
    const h = { tur: 'cikis', geriAlindi: false, malKabulSatiriMi: false, disCagriMi: false };
    assert.equal(geriAlmaEngeli(h), null);
    assert.match(geriAlmaEngeli({ ...h, tur: 'geri_alma' }) ?? '', /geri alınmaz/);
    assert.match(geriAlmaEngeli({ ...h, geriAlindi: true }) ?? '', /zaten/);
    assert.match(geriAlmaEngeli({ ...h, malKabulSatiriMi: true }) ?? '', /belgeyi düzeltin/);
    assert.match(geriAlmaEngeli({ ...h, disCagriMi: true }) ?? '', /çağrıyla/);
    assert.deepEqual(tersYon(3, null), { kaynak: null, hedef: 3 });
    assert.match(duzeltmeEngeli({ duzeltildi: true }) ?? '', /zaten düzeltildi/);
    assert.equal(duzeltmeEngeli({ duzeltildi: false }), null);
  });

  test('DEP-39 Logo eşleşme durumu sayılan ve irsaliye miktarından', () => {
    assert.equal(logoEslesmeDurumu('10', null), 'irsaliye_bekleniyor');
    assert.equal(logoEslesmeDurumu('10', '10.000'), 'eslesti');
    assert.equal(logoEslesmeDurumu('10', '9'), 'fark_var');
  });

  test('DEP-50/51 Logo: yalnız üretime sarf ve üretim girişi gider; ambar karşılığı yoksa uydurulmaz', () => {
    assert.equal(logoyaGiderMi({ tur: 'cikis', cikisNedeni: 'uretime_sarf', girisKaynagi: null }), true);
    assert.equal(logoyaGiderMi({ tur: 'giris', cikisNedeni: null, girisKaynagi: 'uretim' }), true);
    assert.equal(logoyaGiderMi({ tur: 'giris', cikisNedeni: null, girisKaynagi: 'mal_kabul' }), false);
    assert.equal(logoyaGiderMi({ tur: 'cikis', cikisNedeni: 'sevk', girisKaynagi: null }), false);
    assert.deepEqual(logoAmbari(null), { tur: 'karsilik-yok' });
    assert.deepEqual(logoAmbari(3), { tur: 'tamam', ambarNo: 3 });
  });

  test('DEP-34 mal kabul göz önerisi: malzemenin gözü, yoksa kolay kattaki boş göz, yoksa veri yetersiz (null)', () => {
    const a = (konumId: number, kod: string, katNo: number, bos: boolean, buMalzemeVar = false) => ({ konumId, kod, katNo, bos, buMalzemeVar });
    assert.equal(malKabulGozOnerisi([a(1, 'A-01-01', 1, true), a(2, 'A-01-03', 3, false, true)])?.konumId, 2);
    assert.equal(malKabulGozOnerisi([a(1, 'A-01-01', 1, true), a(3, 'A-01-02', 2, true)])?.konumId, 3);
    assert.equal(malKabulGozOnerisi([a(1, 'A-01-01', 1, false)]), null);
  });

  test('MH1 hizmet stoklanmaz; malzeme türleri stoklanır', () => {
    assert.equal(stoklanirMi('hizmet'), false);
    for (const tur of ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas']) assert.equal(stoklanirMi(tur), true);
  });

  test('KD-009 sipariş satırının kartı mal kabul kartından farklıysa engel; kartsız kalem serbest', () => {
    assert.equal(siparisMalzemeEngeli(7, 7), null);
    assert.equal(siparisMalzemeEngeli(7, null), null);
    assert.match(siparisMalzemeEngeli(7, 8) ?? '', /başka bir malzeme kartına ait/);
  });
  test('DEP-58 mal kabul satırı: hizmet siparişinde dönen malzeme fasondur, dönmezse saf hizmettir; karışık girdiler reddedilir', () => {
    const b = { malzemeTuru: 'yarimamul', siparisMalzemeTuru: null as string | null, siparisVar: false, fasonVar: false, konumVar: false, partiVar: false };
    assert.deepEqual(malKabulSatirTuru(b), { tur: 'stok' });
    assert.deepEqual(malKabulSatirTuru({ ...b, siparisVar: true, siparisMalzemeTuru: 'yarimamul' }), { tur: 'stok' });
    assert.deepEqual(malKabulSatirTuru({ ...b, siparisVar: true, siparisMalzemeTuru: 'hizmet', fasonVar: true }), { tur: 'fason' });
    assert.deepEqual(malKabulSatirTuru({ ...b, malzemeTuru: 'hizmet', siparisVar: true, siparisMalzemeTuru: 'hizmet' }), { tur: 'hizmet' });
    const alan = (x: ReturnType<typeof malKabulSatirTuru>) => ('hata' in x ? x.alan : null);
    assert.equal(alan(malKabulSatirTuru({ ...b, siparisVar: true, siparisMalzemeTuru: 'hizmet' })), 'fason');
    assert.equal(alan(malKabulSatirTuru({ ...b, fasonVar: true })), 'fason');
    assert.equal(alan(malKabulSatirTuru({ ...b, siparisVar: true, siparisMalzemeTuru: 'yarimamul', fasonVar: true })), 'fason');
    assert.equal(alan(malKabulSatirTuru({ ...b, malzemeTuru: 'hizmet' })), 'siparisSatirId');
    assert.equal(alan(malKabulSatirTuru({ ...b, malzemeTuru: 'hizmet', siparisVar: true, siparisMalzemeTuru: 'hizmet', fasonVar: true })), 'malzemeId');
    assert.equal(alan(malKabulSatirTuru({ ...b, malzemeTuru: 'hizmet', siparisVar: true, siparisMalzemeTuru: 'hizmet', konumVar: true })), 'malzemeId');
    assert.equal(alan(malKabulSatirTuru({ ...b, malzemeTuru: 'hizmet', siparisVar: true, siparisMalzemeTuru: 'hizmet', partiVar: true })), 'malzemeId');
  });
  test('emir tamamlama: brüt malzeme başına toplanır ve üç ondalığa yukarı yuvarlanır; fazla verilen sarf kalanı eksiye düşürmez; engel sırası', () => {
    const t = ihtiyacToplami([{ malzemeId: 1, brut: '8.0000' }, { malzemeId: 2, brut: '1.3332' }, { malzemeId: 1, brut: '2.0000' }, { malzemeId: 3, brut: '0.0005' }, { malzemeId: 4, brut: '1.2340' }]);
    assert.deepEqual([...t.entries()], [[1, 10000n], [2, 1334n], [3, 1n], [4, 1234n]]);
    assert.deepEqual([...ihtiyacToplami([{ malzemeId: 5, brut: '0.0004' }, { malzemeId: 5, brut: '0.0006' }]).entries()], [[5, 1n]], 'önce toplanır, sonra yuvarlanır');
    assert.throws(() => ihtiyacToplami([{ malzemeId: 1, brut: '1.23456' }]));
    assert.equal(kalanSarf(10000n, 3000n), 7000n);
    assert.equal(kalanSarf(10000n, 12000n), 0n);
    assert.equal(tamamlamaEngeli({ durum: 'basladi', eksikVar: false, yapilacakVar: true }), 'Emir bitmedi; stokta tamamlama bitmiş emirde yapılır.');
    assert.equal(tamamlamaEngeli({ durum: 'bitti', eksikVar: true, yapilacakVar: true }), 'Eksik malzeme var; önce eksikleri teslim alın.');
    assert.equal(tamamlamaEngeli({ durum: 'bitti', eksikVar: false, yapilacakVar: false }), 'Bu emir stokta zaten tamamlandı.');
    assert.equal(tamamlamaEngeli({ durum: 'bitti', eksikVar: false, yapilacakVar: true }), null);
  });

  test('malzeme isteği yalnız ileri gider: açık hazırlanır; açık ve hazırlanan teslim ya da iptal olur; kapanan değişmez', () => {
    assert.equal(istekGecisEngeli('acik', 'hazirla'), null);
    assert.equal(istekGecisEngeli('hazirlaniyor', 'hazirla'), 'İstek zaten hazırlanıyor.');
    for (const g of ['teslim', 'iptal'] as const) {
      assert.equal(istekGecisEngeli('acik', g), null);
      assert.equal(istekGecisEngeli('hazirlaniyor', g), null);
    }
    for (const g of ['hazirla', 'teslim', 'iptal'] as const) {
      assert.equal(istekGecisEngeli('teslim', g), 'İstek teslim edildi; değiştirilemez.');
      assert.equal(istekGecisEngeli('iptal', g), 'İstek iptal edildi; değiştirilemez.');
    }
  });

  test('stok değeri: pozitif toplam x TRY birim fiyatı, kuruşa yarım yukarı; fiyatsız stoklu kart sayılır; hiç fiyat yoksa null', () => {
    const t = [{ malzemeId: 1, toplam: '3.5' }, { malzemeId: 2, toplam: '2' }, { malzemeId: 3, toplam: '-4' }, { malzemeId: 4, toplam: '0' }, { malzemeId: 5, toplam: '1' }];
    const f = new Map<number, string | null>([[1, '245'], [2, '175.12345'], [3, '10'], [5, null]]);
    // 3.5 x 245 = 857.5; 2 x 175.1235 (dördüncü ondalığa yuvarlanır) = 350.247 -> toplam 1207.747 -> 1207.75
    assert.deepEqual(stokDegeri(t, f), { deger: '1207.75', fiyatsizKart: 1 });
    assert.deepEqual(stokDegeri([{ malzemeId: 9, toplam: '2' }], new Map()), { deger: null, fiyatsizKart: 1 });
    assert.deepEqual(stokDegeri([], new Map()), { deger: null, fiyatsizKart: 0 });
    assert.deepEqual(stokDegeri([{ malzemeId: 1, toplam: '0.001' }], new Map([[1, '0.0049']])), { deger: '0.00', fiyatsizKart: 0 });
  });

  test('harita eşlemesi (#686): depo kodu bölüm kodundan, doluysa sıralı', () => {
    assert.equal(depoKoduOner('hb-1', new Set()), 'HB1');
    assert.equal(depoKoduOner('ANA', new Set(['ANA', 'ANA2'])), 'ANA3');
    assert.equal(depoKoduOner('ABCDEFGHIJK', new Set(['ABCDEFGHIJ'])), 'ABCDEFGHI2');
    assert.equal(depoKoduOner('._', new Set()), 'DEPO');
  });

  test('harita eşlemesi (#686): kod çakışan göz atlanır, stok rafından gelen konumun kodu kalır, stoklu kopuk konum kapanmaz', () => {
    const goz = (id: number, adres: string, rafAktif = true) => ({ id, adres, salonId: 1, salonKodu: 'ANA', bolme: 1, kat: 1, rafAktif });
    const konum = (id: number, kod: string, o: { rafId?: number; gozId?: number; alanId?: number; satir?: number; aktif?: boolean } = {}) =>
      ({ id, kod, tur: 'raf_gozu', depoId: 5, aktif: o.aktif ?? true, rafId: o.rafId ?? null, gozId: o.gozId ?? null, alanId: o.alanId ?? null, satirSayisi: o.satir ?? 0 });
    const plan = haritaPlani({
      gozler: [goz(1, 'A1-01-1-1'), goz(2, 'A1-02-1-1', false), goz(3, 'A1-03-1-1'), goz(4, 'A1-04-1-1')],
      alanlar: [{ id: 9, salonId: 1, tur: 'yuruyus_yolu', ad: 'x' }],
      depolar: [{ id: 5, kod: 'ANA', salonId: 1, aktif: true }],
      konumlar: [konum(10, '12-01-01', { rafId: 7, gozId: 2 }), konum(11, 'ESKI-ADRES', { gozId: 3 }), konum(12, 'B9-01-1-1', { satir: 2 }), konum(13, 'B9-02-1-1')],
      kodlar: new Set(['A1-01-1-1', '12-01-01', 'ESKI-ADRES', 'B9-01-1-1', 'B9-02-1-1']),
    });
    assert.deepEqual(plan.ekle.map((k) => k.kod), ['A1-04-1-1']);
    assert.deepEqual(plan.guncelle, [{ id: 10, kod: '12-01-01', aktif: false }, { id: 11, kod: 'A1-03-1-1', aktif: true }]);
    assert.deepEqual(plan.kapat, [13]);
    assert.deepEqual(plan.atlanan, ['A1-01-1-1', 'B9-01-1-1']);
  });

  test('harita eşlemesi (#711): depo olmayan bölümün gözü konum olmaz; bağlı stoksuz konumu kapanır, stoklusu bildirilir', () => {
    const goz = (id: number, salonId: number) => ({ id, adres: `U${id}-01-1-1`, salonId, salonKodu: salonId === 1 ? 'ANA' : 'URETIM', bolme: 1, kat: 1, rafAktif: true });
    const konum = (id: number, gozId: number, satir: number) => ({ id, kod: `U${gozId}-01-1-1`, tur: 'raf_gozu', depoId: 6, aktif: true, rafId: null, gozId, alanId: null, satirSayisi: satir });
    const plan = haritaPlani({
      gozler: [goz(1, 1), goz(2, 2), goz(3, 2), goz(4, 2)],
      alanlar: [{ id: 7, salonId: 2, tur: 'kabul', ad: 'Üretim kabul' }],
      depolar: [{ id: 5, kod: 'ANA', salonId: 1, aktif: true }, { id: 6, kod: 'URETIM', salonId: 2, aktif: false }],
      konumlar: [konum(20, 3, 0), konum(21, 4, 1)],
      kodlar: new Set(['U3-01-1-1', 'U4-01-1-1']),
    });
    assert.deepEqual(plan.ekle.map((k) => k.kod), ['U1-01-1-1']);
    assert.deepEqual(plan.kapat, [20]);
    assert.deepEqual(plan.atlanan, ['U4-01-1-1']);
  });

  test('harita eşlemesi (KD-042): pasif rafın stoklu gözü kapatılmaz, bildirilir; stoksuzu kapanır', () => {
    const goz = (id: number) => ({ id, adres: `P1-0${id}-1-1`, salonId: 1, salonKodu: 'ANA', bolme: id, kat: 1, rafAktif: false });
    const konum = (id: number, gozId: number, satir: number) => ({ id, kod: `P1-0${gozId}-1-1`, tur: 'raf_gozu', depoId: 5, aktif: true, rafId: null, gozId, alanId: null, satirSayisi: satir });
    const plan = haritaPlani({
      gozler: [goz(1), goz(2)], alanlar: [], depolar: [{ id: 5, kod: 'ANA', salonId: 1, aktif: true }],
      konumlar: [konum(10, 1, 2), konum(11, 2, 0)], kodlar: new Set(['P1-01-1-1', 'P1-02-1-1']),
    });
    assert.deepEqual(plan.guncelle, [{ id: 11, kod: 'P1-02-1-1', aktif: false }]);
    assert.deepEqual(plan.atlanan, ['P1-01-1-1']);
  });

  test('harita eşlemesi (#1304): fason, ara alan ve hurda depo olmayan bölümde ANA depoya konum olur; kabul olmaz', () => {
    const plan = haritaPlani({
      gozler: [],
      alanlar: [{ id: 1, salonId: 2, tur: 'hurda', ad: 'Hurda' }, { id: 2, salonId: 2, tur: 'ara_alan', ad: 'B-4' }, { id: 3, salonId: 2, tur: 'fason', ad: 'Fason' },
        { id: 4, salonId: 2, tur: 'kabul', ad: 'Kabul' }, { id: 5, salonId: 1, tur: 'hurda', ad: 'Depo hurda' }],
      depolar: [{ id: 5, kod: 'ANA', salonId: null, aktif: true }, { id: 6, kod: 'D1', salonId: 1, aktif: true }],
      konumlar: [], kodlar: new Set(),
    });
    assert.deepEqual(plan.ekle.map((k) => [k.kod, k.tur, k.depoId]), [['ALAN-1', 'hurda', 5], ['ALAN-2', 'ara_alan', 5], ['ALAN-3', 'fason', 5], ['ALAN-5', 'hurda', 6]]);
  });

  test('harita eşlemesi (karar 97): haritanın bütün kutuları türüyle konum olur, depo olmayan bölümde ANA depoya; yürüyüş yolu olmaz', () => {
    const turler = ['oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet', 'yuruyus_yolu'];
    const plan = haritaPlani({
      gozler: [],
      alanlar: turler.map((tur, i) => ({ id: i + 1, salonId: 2, tur, ad: tur })),
      depolar: [{ id: 5, kod: 'ANA', salonId: null, aktif: true }],
      konumlar: [], kodlar: new Set(),
    });
    assert.deepEqual(plan.ekle.map((k) => [k.kod, k.tur, k.depoId]), turler.slice(0, 6).map((tur, i) => [`ALAN-${i + 1}`, tur, 5]));
  });

  test('harita eşlemesi (#1304): alanın türü değişince stoksuz konum izler, stoklusu kalır ve bildirilir; stok dışı türe dönen kapanır', () => {
    const konum = (id: number, alanId: number, tur: string, satir: number) => ({ id, kod: `ALAN-${alanId}`, tur, depoId: 5, aktif: true, rafId: null, gozId: null, alanId, satirSayisi: satir });
    const plan = haritaPlani({
      gozler: [],
      alanlar: [{ id: 1, salonId: 1, tur: 'hurda', ad: 'a' }, { id: 2, salonId: 1, tur: 'hurda', ad: 'b' }, { id: 3, salonId: 1, tur: 'yuruyus_yolu', ad: 'c' }, { id: 4, salonId: 1, tur: 'depo_zemini', ad: 'd' }],
      depolar: [{ id: 5, kod: 'ANA', salonId: 1, aktif: true }],
      konumlar: [konum(10, 1, 'depo_zemini', 0), konum(11, 2, 'depo_zemini', 3), konum(12, 3, 'kabul', 0), konum(13, 4, 'depo_zemini', 0)],
      kodlar: new Set(['ALAN-1', 'ALAN-2', 'ALAN-3', 'ALAN-4']),
    });
    assert.deepEqual(plan.turDegisimi, [{ id: 10, tur: 'hurda', depoId: 5 }]);
    assert.deepEqual(plan.atlanan, ['ALAN-2']);
    assert.deepEqual(plan.kapat, [12]);
    assert.deepEqual(plan.guncelle, []);
  });
});

describe('stok kuralları: üretim sayımı (kart #1289)', () => {
  test('STK-U1 sağlam artışı önce gelen parçanın statüsünü çevirir, kalanı yeni giriştir; yoldakine dokunmaz', () => {
    const bakiyeler = [
      { partiId: 1, statuId: 10, miktar: '5.000', ayrilan: '2.000' },
      { partiId: 2, statuId: 20, miktar: '4.000', ayrilan: '0' },
    ];
    const p = sayimArtisPlani(5000n, 20, bakiyeler);
    assert.deepEqual(p.donusumler, [{ partiId: 1, kaynakStatuId: 10, hedefStatuId: 20, kaynakKalite: 'serbest', hedefKalite: 'serbest', miktar: 3000n }]);
    assert.equal(p.giris, 2000n);
    assert.equal(sayimArtisPlani(4000n, null, []).giris, 4000n, 'ilk adım: yalnız giriş');
  });
  test('STK-U2 sağlam azalışı teslim edilenin altına inemez; önce dönüşüm geri çevrilir, kalanı girişten düşer', () => {
    const bakiyeler = [{ partiId: 1, statuId: 20, miktar: '5.000', ayrilan: '3.000' }];
    assert.equal(sayimAzalisPlani(3000n, 20, bakiyeler, []), null, 'yoldaki 3 adet kilitli');
    const donusum = [{ partiId: 1, oncekiStatuId: 10, miktar: '1.000' }];
    const p = sayimAzalisPlani(2000n, 20, bakiyeler, donusum);
    assert.ok(p);
    assert.deepEqual(p.donusumler, [{ partiId: 1, kaynakStatuId: 20, hedefStatuId: 10, kaynakKalite: 'serbest', hedefKalite: 'serbest', miktar: 1000n }]);
    assert.deepEqual(p.geriAlinacaklar, [{ partiId: 1, statuId: 20, kaliteDurumu: 'serbest', miktar: 1000n }]);
    assert.equal(sayimAzalisPlani(1000n, 20, [{ partiId: 1, statuId: 10, miktar: '9.000', ayrilan: '0' }], []), null, 'başka statüdeki parça düşülmez');
  });
});

describe('stok kuralları: kalite durumu üretimde (131 b, 135, 138 a)', () => {
  test('138 a: en kötü kalite geçer; karar bekleyen sayım çevrilen parçayı da karar bekliyor yapar', () => {
    assert.equal(enKotuKalite('serbest', 'sartli', 'karar_bekliyor'), 'karar_bekliyor');
    assert.equal(enKotuKalite('karar_bekliyor', 'red', 'serbest'), 'red');
    assert.equal(enKotuKalite(), 'serbest');
    const bakiyeler = [{ partiId: 1, statuId: 10, kaliteDurumu: 'red' as const, miktar: '2.000', ayrilan: '0' }, { partiId: 2, statuId: 10, miktar: '5.000', ayrilan: '0' }];
    assert.deepEqual(sayimArtisPlani(4000n, 20, bakiyeler, 'karar_bekliyor').donusumler.map((d) => [d.partiId, d.kaynakKalite, d.hedefKalite, d.miktar]),
      [[1, 'red', 'red', 2000n], [2, 'serbest', 'karar_bekliyor', 2000n]]);
  });
  test('karar bekleyen düzeltme önce karar bekleyenden düşer; kalite geri çevrilmez', () => {
    const bakiyeler = [{ partiId: 1, statuId: 20, kaliteDurumu: 'serbest' as const, miktar: '3.000', ayrilan: '0' }, { partiId: 1, statuId: 20, kaliteDurumu: 'karar_bekliyor' as const, miktar: '2.000', ayrilan: '0' }];
    assert.deepEqual(sayimAzalisPlani(3000n, 20, bakiyeler, [], 'karar_bekliyor')?.geriAlinacaklar.map((g) => [g.kaliteDurumu, g.miktar]),
      [['karar_bekliyor', 2000n], ['serbest', 1000n]]);
  });
  test('135: istasyondaki red ve karar bekleyen girdi rezerve dışı alınır; serbestten yalnız emrin hakkı kadar', () => {
    const kaynaklar = [{ k: 'a', kaliteDurumu: 'serbest' as const, serbest: '5.000' }, { k: 'b', kaliteDurumu: 'red' as const, serbest: '2.000' }, { k: 'c', kaliteDurumu: 'serbest' as const, serbest: '4.000' }];
    assert.deepEqual(girdiSec(kaynaklar, 6000n, 3000n).map((x) => [x.k, x.miktar]), [['a', 3000n], ['b', 2000n]], 'serbest hakkı 3; kalan red');
    assert.deepEqual(girdiSec(kaynaklar, 4000n, 9000n).map((x) => [x.k, x.miktar]), [['a', 4000n]]);
    assert.deepEqual(girdiSec(kaynaklar, 1000n, 0n).map((x) => [x.k, x.miktar]), [['b', 1000n]]);
  });
});

describe('kart #1353 sonraki istasyon', () => {
  const adimlar = [
    { sira: 1, opNo: 10, istasyonId: 1, statuId: 110 }, { sira: 2, opNo: 20, istasyonId: 1, statuId: 120 },
    { sira: 3, opNo: 30, istasyonId: 2, statuId: 130 }, { sira: 4, opNo: 40, istasyonId: null, statuId: 140 }, { sira: 5, opNo: 50, istasyonId: 3, statuId: null },
  ];
  test('aynı istasyondaki ardışık adım atlanır; statü parçanın adımını seçer', () => {
    assert.deepEqual(sonrakiIstasyon(adimlar, 1, 110), { istasyonId: 2, opNo: 30 });
    assert.deepEqual(sonrakiIstasyon(adimlar, 1, 120), { istasyonId: 2, opNo: 30 });
    assert.deepEqual(sonrakiIstasyon([...adimlar].reverse(), 1, 110), { istasyonId: 2, opNo: 30 }, 'sıra numarasıyla sıralanır');
  });
  test('fason, son adım ve rota dışı ayrı nedenle döner', () => {
    assert.deepEqual(sonrakiIstasyon(adimlar, 2, 130), { yok: 'fason' });
    assert.deepEqual(sonrakiIstasyon(adimlar, 3, null), { yok: 'son-adim' });
    assert.deepEqual(sonrakiIstasyon(adimlar, 9, null), { yok: 'rota-disi' });
    assert.deepEqual(sonrakiIstasyon(adimlar, 1, 999), { yok: 'rota-disi' }, 'bu istasyonun adımına ait olmayan statü');
    assert.deepEqual(sonrakiIstasyon(adimlar, 1, null), { istasyonId: 2, opNo: 30 }, 'statüsüz parça istasyondaki son adımdan çıkar');
  });
});

describe('stok kuralları: terminal üretim girişi', () => {
  const hm = { malzemeNo: 1, miktar: '2.5' };
  const plan = (g: Partial<Parameters<typeof uretimAdimPlani>[0]>) => uretimAdimPlani({
    adet: 1000n, ilkAdim: false, sonAdim: false, statuId: null, oncekiStatuId: null, oncekiCiktili: false, cikti: null, girdiler: [], tasinan: hm, ...g,
  });
  test('ilk ara adım taşınanı çevirir, öteki girdiyi sarf eder; son adım taşınanı düşer ve ürün girer; tek adımlı rotada hepsi sarf', () => {
    assert.deepEqual(plan({ adet: 4000n, ilkAdim: true, statuId: 10, girdiler: [hm, { malzemeNo: 2, miktar: '0.3333' }] }),
      { sarflar: [{ malzemeId: 2, statuId: null, miktar: 1334n }], cevirme: { malzemeId: 1, kaynakStatuId: null, hedefStatuId: 10, miktar: 10000n }, giris: null });
    assert.deepEqual(plan({ adet: 2000n, sonAdim: true, oncekiStatuId: 20 }),
      { sarflar: [{ malzemeId: 1, statuId: 20, miktar: 5000n, tasinan: true }], cevirme: null, giris: { malzemeId: null, miktar: 2000n } });
    assert.deepEqual(plan({ ilkAdim: true, sonAdim: true, girdiler: [hm] }),
      { sarflar: [{ malzemeId: 1, statuId: null, miktar: 2500n }], cevirme: null, giris: { malzemeId: null, miktar: 1000n } });
    assert.equal(plan({ statuId: 20, oncekiStatuId: 20 }).cevirme, null, 'statü değişmeyen ara adım (ek adım) çevirmez');
  });
  test('çıktılı adım taşınanı düşer ve çıktı kartını girer; sonraki adım çıktıyı statüsüzden alır', () => {
    assert.deepEqual(plan({ adet: 2000n, oncekiStatuId: 20, cikti: 9 }),
      { sarflar: [{ malzemeId: 1, statuId: 20, miktar: 5000n, tasinan: true }], cevirme: null, giris: { malzemeId: 9, miktar: 2000n } });
    assert.deepEqual(plan({ ilkAdim: true, cikti: 9, girdiler: [hm] }),
      { sarflar: [{ malzemeId: 1, statuId: null, miktar: 2500n }], cevirme: null, giris: { malzemeId: 9, miktar: 1000n } }, 'ilk adım çıktılıysa taşınan girdi olarak düşülür');
    const ym = { malzemeNo: 9, miktar: '1' };
    assert.deepEqual(plan({ statuId: 40, oncekiStatuId: 30, oncekiCiktili: true, tasinan: ym }).cevirme,
      { malzemeId: 9, kaynakStatuId: null, hedefStatuId: 40, miktar: 1000n, tasinan: true });
    assert.deepEqual(plan({ sonAdim: true, oncekiStatuId: 30, oncekiCiktili: true, tasinan: ym }).sarflar, [{ malzemeId: 9, statuId: null, miktar: 1000n, tasinan: true }]);
  });
  test('kaynaklardan sırayla alınır; yetmezse bulunan kadarı', () => {
    assert.deepEqual(kaynaklardanAl([{ serbest: '1.5' }, { serbest: '0' }, { serbest: '4' }], 3000n).map((x) => x.miktar), [1500n, 1500n]);
    assert.deepEqual(kaynaklardanAl([{ serbest: '1' }], 3000n).map((x) => x.miktar), [1000n]);
    assert.deepEqual([rezerveSiniri(10000n, 0n, 4000n), rezerveSiniri(10000n, 7500n, 4000n), rezerveSiniri(10000n, 12000n, 4000n)], [4000n, 2500n, 0n], 'başka emre ayrılan kullanılmaz');
  });
  test('kart #1289 başlatma eksikleri: istasyonda bir adetlik girdi yoksa eksik; istenecek emrin bütün adedinden istasyondakini çıkarır', () => {
    const girdiler = [{ malzemeNo: 1, miktar: '2.5' }, { malzemeNo: 2, miktar: '0.1' }, { malzemeNo: 2, miktar: '0.1' }, { malzemeNo: 3, miktar: '1' }];
    assert.deepEqual(baslatmaEksikleri(girdiler, new Map([[1, 1000n], [2, 200n]]), 10000n), [{ malzemeId: 1, gereken: 2500n, istasyonda: 1000n, istenecek: 24000n }, { malzemeId: 3, gereken: 1000n, istasyonda: 0n, istenecek: 10000n }]);
    assert.deepEqual(baslatmaEksikleri(girdiler, new Map([[1, 2500n], [2, 200n], [3, 1000n]]), 10000n), [], 'bir adetlik varsa başlar');
    assert.deepEqual(baslatmaEksikleri([], new Map(), 10000n), []);
  });
  test('başlatma eksiğinde istenecek reçete miktarının dört ondalığıyla hesaplanır, tek adet önce yuvarlanmaz', () => {
    assert.deepEqual(baslatmaEksikleri([{ malzemeNo: 1, miktar: '0.0004' }], new Map(), 1000000n).map((x) => x.istenecek), [400n], '1000 adet x 0,0004 = 0,4');
    assert.deepEqual(baslatmaEksikleri([{ malzemeNo: 1, miktar: '0.0015' }], new Map(), 100000n).map((x) => x.istenecek), [150n], '100 adet x 0,0015 = 0,15');
    assert.deepEqual(baslatmaEksikleri([{ malzemeNo: 1, miktar: '0.0003' }, { malzemeNo: 1, miktar: '0.0003' }], new Map(), 1000000n).map((x) => x.istenecek), [600n], 'önce toplanır');
    assert.deepEqual(baslatmaEksikleri([{ malzemeNo: 1, miktar: '0.0004' }], new Map(), 1500n).map((x) => x.istenecek), [1n], 'stoğun üç ondalığına yukarı');
  });

  test('STK-F1 fason gönderimi eksik mi: beklenenden az taşındıysa eksik; tam ya da fazla taşıma ve sıfır beklenen eksik değil', () => {
    assert.equal(fasonGonderimiEksikMi(9000n, 7000n), true);
    assert.equal(fasonGonderimiEksikMi(9000n, 0n), true);
    assert.equal(fasonGonderimiEksikMi(9000n, 9000n), false);
    assert.equal(fasonGonderimiEksikMi(9000n, 10000n), false);
    assert.equal(fasonGonderimiEksikMi(0n, 0n), false);
  });
});

describe('stok kuralları: parti etiketi emir numarası (borç #419)', () => {
  const emirli = { lotNo: 'L-1', tedarikciPartiNo: null, dokumNo: null, uretimEmriId: 41 };
  test('emir numarası varsa numara yazılır, kimlik yazılmaz', () => {
    assert.equal(partiEtiketi(emirli, 'UE-0041'), 'L-1 · Emir UE-0041');
  });
  test('numara bilinmiyorsa kimlik yedek olarak kalır; numara uydurulmaz', () => {
    assert.equal(partiEtiketi(emirli), 'L-1 · Emir #41');
    assert.equal(partiEtiketi(emirli, null), 'L-1 · Emir #41');
  });
  test('emirsiz partide numara görmezden gelinir', () => {
    assert.equal(partiEtiketi({ ...emirli, uretimEmriId: null, tedarikciPartiNo: 'TP-9' }, 'UE-0041'), 'L-1 · TP-9');
    assert.equal(partiEtiketi(null, 'UE-0041'), null);
  });

  test('235 a: sevk durumu adımlara açılır; havuz ile planlandı aynıdır, atlanan ara durum iki adımdır', () => {
    assert.deepEqual(urunSevkAdimlari('planlandi', 'yolda'), ['yola_cik']);
    assert.deepEqual(urunSevkAdimlari('havuzda', 'tamamlandi'), ['yola_cik', 'teslim']);
    assert.deepEqual(urunSevkAdimlari('tamamlandi', 'havuzda'), ['teslim_geri', 'yola_geri']);
    assert.deepEqual(urunSevkAdimlari('yolda', 'planlandi'), ['yola_geri']);
    assert.deepEqual(urunSevkAdimlari('havuzda', 'planlandi'), []);
  });
  test('sevk adedi dört haneli ondalıktan binde çevrilir; binde sığmayan kesir reddedilir', () => {
    assert.deepEqual([sevkAdediBinde('6.0000'), sevkAdediBinde('2'), sevkAdediBinde('1.2500'), sevkAdediBinde('1.0005'), sevkAdediBinde('x')], [6000n, 2000n, 1250n, null, null]);
  });
  test('denetim #1: elle sarf, sayımın ihtiyacı aşan kısmından mahsup edilir; elle sarf yoksa ya da ihtiyaç bilinmiyorsa mahsup yok', () => {
    const m = (istenen: bigint, elle: bigint, net: bigint, ihtiyac: bigint | null) => elleSarfMahsubu({ istenen, elle, net, ihtiyac });
    assert.deepEqual([m(10n, 10n, 10n, 10n), m(10n, 4n, 4n, 10n), m(6n, 4n, 4n, 10n), m(4n, 4n, 10n, 10n), m(10n, 0n, 0n, 10n), m(10n, 10n, 10n, null), m(4n, 10n, 14n, 10n)],
      [10n, 4n, 0n, 4n, 0n, 0n, 4n]);
  });
  test('denetim #16: yalnız kaliteyi değiştiren hareket kalite kararıdır; kaliteyle çıkış ve aynı kalitede taşıma değildir', () => {
    const k = (kaynakKaliteDurumu: 'serbest' | 'red' | null, hedefKaliteDurumu: 'serbest' | 'red' | null) => kaliteKarariHareketiMi({ kaynakKaliteDurumu, hedefKaliteDurumu });
    assert.deepEqual([k('serbest', 'red'), k('red', null), k('red', 'red'), k(null, 'serbest')], [true, false, false, false]);
  });
  test('denetim #15: karantinadan yalnız hurdaya taşıma ve fire çıkışı; başka konumdan her şey serbest', () => {
    const e = (kaynak: 'karantina' | 'raf_gozu', g: { cikisNedeni: string } | { hedefTuru: 'hurda' | 'kabul' | 'karantina' }) => karantinaEngeli(kaynak, g) === null;
    assert.deepEqual([e('karantina', { hedefTuru: 'hurda' }), e('karantina', { cikisNedeni: 'fire' }), e('karantina', { hedefTuru: 'kabul' }), e('karantina', { cikisNedeni: 'sevk' }),
      e('raf_gozu', { hedefTuru: 'karantina' }), e('raf_gozu', { cikisNedeni: 'diger' })], [true, true, false, false, true, true]);
  });

  test('STK-T8 kişi kodu: biçim çözülür, büyük-küçük harf imzayı bozmaz; süre geçen ya da imzası tutmayan reddedilir', () => {
    const govde = kisiKoduGovdesi(42, 1_800_000_000);
    assert.equal(govde, 'KSI-42-TRO8W0');
    const imza = 'ab'.repeat(16);
    assert.deepEqual(kisiKoduAyristir(` ${govde}-${imza.toUpperCase()} `), { govde, kisiId: 42, sonSn: 1_800_000_000, imza });
    for (const k of ['KSI-42-TRO8W0', `KSI-x-TRCU80-${imza}`, `KSI-42-TRO8W0-${imza}0`, `LOC-42-TRCU80-${imza}`]) assert.equal(kisiKoduAyristir(k), null, k);
    assert.equal(kisiKoduEngeli(100, 100, true), null, 'son saniyede geçerli');
    assert.match(kisiKoduEngeli(99, 100, true)!, /süresi geçti/);
    assert.match(kisiKoduEngeli(200, 100, false)!, /geçersiz/);
    assert.match(kisiKoduEngeli(101 + KISI_KODU_SURESI_SN, 100, true)!, /geçersiz/, 'süreden uzun ileri tarihli kod');
  });
});
