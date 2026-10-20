import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AZAMI_SAYIM, adimCevabi, adimParametresi, adimTamamlaGovdesi, bitirGovdesi, canliSemasi, durdurGovdesi, emirAyrintiCevabi, emirGovdesi,
  bitenEmirlerSorgusu, emirParametresi, emirSemasi, emirlerSorgusu, kayitSemasi, sayimAyarlaGovdesi, sayimGovdesi,
} from './uretim-emirleri.ts';

const GOVDE = { parcaNo: 'P-1', parcaAd: 'Deneme Parça', adet: 5, istasyonId: 3, projeId: 7 };
const EMIR = {
  id: 1, emirNo: 'UE-1', parcaNo: 'P-1', parcaAd: 'Deneme Parça', adet: 5,
  istasyon: { id: 3, ad: 'Torna 1' }, durum: 'planli', acan: { id: 2, ad: 'Deneme Kişi' },
  acilma: '2026-10-07T08:00:00.000Z', baslama: null, bitis: null, iptal: null, saglamAdet: null,
};
const KAYIT = {
  id: 1, emirId: 1, kisi: { id: 2, ad: 'Deneme Kişi' }, istasyon: { id: 3, ad: 'Torna 1' },
  olay: 'baslat', saglamAdet: null, zaman: '2026-10-07T09:00:00.000Z',
};
const CANLI = { calisma: 'calisiyor', saglam: 0, hurda: 0, durusNedeni: null, durusBaslangic: null };

const gecer = (sema: { safeParse: (d: unknown) => { success: boolean } }, deger: unknown): boolean => sema.safeParse(deger).success;

test('emir gövdesi: adet pozitif tam sayıdır; sıfır, eksi, kesirli ve metin adet reddedilir', () => {
  assert.deepEqual(emirGovdesi.parse(GOVDE), GOVDE);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, adet: 1 }), true);
  for (const adet of [0, -1, 1.5, '5', null, undefined, 2147483648]) {
    assert.equal(gecer(emirGovdesi, { ...GOVDE, adet }), false, String(adet));
  }
});

test('emir gövdesi: parça no ve adı kırpılır; boş ya da yalnız boşluk reddedilir, istasyon zorunludur', () => {
  assert.deepEqual(emirGovdesi.parse({ ...GOVDE, parcaNo: '  P-1 ', parcaAd: ' Deneme Parça  ' }), GOVDE);
  for (const alan of ['parcaNo', 'parcaAd']) {
    for (const deger of ['', '   ', undefined]) assert.equal(gecer(emirGovdesi, { ...GOVDE, [alan]: deger }), false, `${alan}: ${String(deger)}`);
  }
  assert.equal(gecer(emirGovdesi, { ...GOVDE, parcaNo: 'x'.repeat(60) }), true);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, parcaNo: 'x'.repeat(61) }), false);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, parcaAd: 'x'.repeat(120) }), true);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, parcaAd: 'x'.repeat(121) }), false);
  for (const istasyonId of [0, -3, 1.5, undefined]) assert.equal(gecer(emirGovdesi, { ...GOVDE, istasyonId }), false, String(istasyonId));
});

test('emir gövdesi: adımlar isteğe bağlıdır ve en çok 30 tanedir; ad zorunlu ve kırpılır, boş açıklama null olur', () => {
  const adim = (n: number) => Array.from({ length: n }, (_, i) => ({ ad: `Adım ${i + 1}` }));
  assert.equal('adimlar' in emirGovdesi.parse(GOVDE), false);
  assert.deepEqual(emirGovdesi.parse({ ...GOVDE, adimlar: [] }).adimlar, []);
  assert.equal(emirGovdesi.parse({ ...GOVDE, adimlar: adim(30) }).adimlar?.length, 30);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, adimlar: adim(31) }), false);

  assert.deepEqual(
    emirGovdesi.parse({ ...GOVDE, adimlar: [{ ad: '  Ölç ' }, { ad: 'Çapak al', aciklama: '   ' }, { ad: 'Yıka', aciklama: ' Sıcak su ' }] }).adimlar,
    [{ ad: 'Ölç', aciklama: null }, { ad: 'Çapak al', aciklama: null }, { ad: 'Yıka', aciklama: 'Sıcak su' }],
  );
  for (const ad of ['', '   ', undefined, 'x'.repeat(121)]) assert.equal(gecer(emirGovdesi, { ...GOVDE, adimlar: [{ ad }] }), false, String(ad));
  assert.equal(gecer(emirGovdesi, { ...GOVDE, adimlar: [{ ad: 'x'.repeat(120), aciklama: 'y'.repeat(300) }] }), true);
  assert.equal(gecer(emirGovdesi, { ...GOVDE, adimlar: [{ ad: 'Ölç', aciklama: 'y'.repeat(301) }] }), false);
});

test('bitir gövdesi: sağlam adet isteğe bağlıdır; verilirse sıfır ya da pozitif tam sayıdır; eksi, kesirli, metin ve null reddedilir', () => {
  for (const saglamAdet of [0, 1, 5, 5000]) assert.deepEqual(bitirGovdesi.parse({ saglamAdet }), { saglamAdet });
  assert.deepEqual(bitirGovdesi.parse({}), {});
  for (const saglamAdet of [-1, 0.5, '3', null]) assert.equal(gecer(bitirGovdesi, { saglamAdet }), false, String(saglamAdet));
});

test('sayım gövdesi: sağlam artı ya da eksi olur, sıfır olamaz; hurda da artı ya da eksidir, eksi hurda nedensiz gelebilir', () => {
  for (const adet of [1, -1, 12, -12]) assert.deepEqual(sayimGovdesi.parse({ tur: 'saglam', adet }), { tur: 'saglam', adet });
  for (const adet of [0, 0.5, '1', null, undefined, 2147483648, -2147483648]) {
    assert.equal(gecer(sayimGovdesi, { tur: 'saglam', adet }), false, `sağlam ${String(adet)}`);
  }
  assert.deepEqual(sayimGovdesi.parse({ tur: 'hurda', adet: 2, hurdaNedeniId: 4 }), { tur: 'hurda', adet: 2, hurdaNedeniId: 4 });
  assert.deepEqual(sayimGovdesi.parse({ tur: 'hurda', adet: -1, hurdaNedeniId: 4 }), { tur: 'hurda', adet: -1, hurdaNedeniId: 4 });
  assert.deepEqual(sayimGovdesi.parse({ tur: 'hurda', adet: -1 }), { tur: 'hurda', adet: -1 });
  for (const adet of [0, 1.5, -1.5, undefined]) {
    assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet, hurdaNedeniId: 4 }), false, `hurda ${String(adet)}`);
  }
  for (const tur of ['iyi', '', undefined]) assert.equal(gecer(sayimGovdesi, { tur, adet: 1 }), false, String(tur));
});

test('sayım gövdesi: hurda nedensiz yazılmaz; sağlam sayım hurda nedeni taşıyamaz', () => {
  assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: 1, hurdaNedeniId: 4 }), true);
  assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: 1 }), false);
  for (const hurdaNedeniId of [undefined, null, 0, -1, 1.5, '4']) {
    assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: 1, hurdaNedeniId }), false, String(hurdaNedeniId));
  }
  assert.equal(gecer(sayimGovdesi, { tur: 'saglam', adet: 1 }), true);
  assert.equal(gecer(sayimGovdesi, { tur: 'saglam', adet: 1, hurdaNedeniId: 4 }), false);
});

test('sayım ve ayarla: tek istekte adet en çok bir milyondur (artı ve eksi); sınırın kendisi geçer, bir fazlası reddedilir', () => {
  assert.equal(AZAMI_SAYIM, 1_000_000);
  for (const adet of [AZAMI_SAYIM, -AZAMI_SAYIM]) assert.equal(gecer(sayimGovdesi, { tur: 'saglam', adet }), true, String(adet));
  for (const adet of [AZAMI_SAYIM + 1, -AZAMI_SAYIM - 1]) assert.equal(gecer(sayimGovdesi, { tur: 'saglam', adet }), false, String(adet));
  assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: AZAMI_SAYIM, hurdaNedeniId: 4 }), true);
  assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: AZAMI_SAYIM + 1, hurdaNedeniId: 4 }), false);
  assert.equal(gecer(sayimAyarlaGovdesi, { saglam: AZAMI_SAYIM }), true);
  assert.equal(gecer(sayimAyarlaGovdesi, { saglam: AZAMI_SAYIM + 1 }), false);
});

test('ayarla, durdur ve adım gövdeleri fazladan alanı sessizce atmaz, reddeder', () => {
  assert.equal(gecer(sayimAyarlaGovdesi, { saglam: 3, hurda: 9 }), false);
  assert.equal(gecer(durdurGovdesi, { durusNedeniId: 6, aciklama: 'x' }), false);
  assert.equal(gecer(adimTamamlaGovdesi, { tamam: true, adimId: 2 }), false);
  assert.equal(gecer(sayimGovdesi, { tur: 'hurda', adet: 1, hurdaNedeniId: 4, not: 'x' }), false);
});

test('ayarla, durdur ve adım gövdeleri: sayaç sıfır ya da pozitiftir; duruş nedeni ve işaret zorunludur', () => {
  for (const saglam of [0, 1, 250]) assert.deepEqual(sayimAyarlaGovdesi.parse({ saglam }), { saglam });
  for (const saglam of [-1, 1.5, '3', null, undefined]) assert.equal(gecer(sayimAyarlaGovdesi, { saglam }), false, String(saglam));

  assert.deepEqual(durdurGovdesi.parse({ durusNedeniId: 6 }), { durusNedeniId: 6 });
  for (const durusNedeniId of [undefined, null, 0, -2, '6']) assert.equal(gecer(durdurGovdesi, { durusNedeniId }), false, String(durusNedeniId));

  for (const tamam of [true, false]) assert.deepEqual(adimTamamlaGovdesi.parse({ tamam }), { tamam });
  for (const tamam of [undefined, null, 'true', 1]) assert.equal(gecer(adimTamamlaGovdesi, { tamam }), false, String(tamam));

  assert.deepEqual(adimParametresi.parse({ id: '12', adimId: '3' }), { id: 12, adimId: 3 });
  for (const adimId of [undefined, '0', 'abc']) assert.equal(gecer(adimParametresi, { id: '12', adimId }), false, String(adimId));
});

test('sorgu ve parametre: durum süzgeci isteğe bağlıdır ve yalnız dört durumu kabul eder; istasyon ve emir kimliği metinden sayıya çevrilir', () => {
  assert.deepEqual(emirlerSorgusu.parse({}), { kapsam: 'acik' }, 'varsayılan yalnız açık emirler (kart #1323)');
  assert.deepEqual(emirlerSorgusu.parse({ kapsam: 'hepsi' }), { kapsam: 'hepsi' });
  assert.equal(gecer(emirlerSorgusu, { kapsam: 'biten' }), false);
  for (const durum of ['planli', 'basladi', 'bitti', 'iptal']) assert.deepEqual(emirlerSorgusu.parse({ durum }), { durum, kapsam: 'acik' });
  for (const durum of ['', 'acik', 'PLANLI']) assert.equal(gecer(emirlerSorgusu, { durum }), false, durum);
  assert.deepEqual(bitenEmirlerSorgusu.parse({ durum: 'iptal', ara: '  ab  ' }), { sayfa: 1, durum: 'iptal', ara: 'ab' });
  assert.equal(bitenEmirlerSorgusu.parse({ ara: '   ' }).ara, undefined, 'boş arama süzmez');
  for (const durum of ['planli', 'basladi']) assert.equal(gecer(bitenEmirlerSorgusu, { durum }), false, 'bitenlerde yalnız bitti ve iptal');

  assert.deepEqual(emirParametresi.parse({ id: '12' }), { id: 12 });
  for (const deger of [undefined, '0', '-1', '1.5', 'abc']) {
    assert.equal(gecer(emirParametresi, { id: deger }), false, String(deger));
  }
});

test('emir cevabı: olmayan zaman ve bitmemiş emrin sağlam adedi null kalır, sıfır sıfır kalır; bilinmeyen durum reddedilir', () => {
  assert.deepEqual(emirSemasi.parse(EMIR), EMIR);
  const biten = { ...EMIR, durum: 'bitti', baslama: KAYIT.zaman, bitis: KAYIT.zaman, saglamAdet: 0 };
  assert.deepEqual(emirSemasi.parse(biten), biten);
  assert.equal(gecer(emirSemasi, { ...EMIR, durum: 'acik' }), false);
  // null ile eksik alan ayrıdır: sunucu olmayanı açıkça null yazar.
  for (const alan of ['baslama', 'bitis', 'iptal', 'saglamAdet']) {
    assert.equal(gecer(emirSemasi, { ...EMIR, [alan]: undefined }), false, alan);
  }
  assert.equal(gecer(emirSemasi, { ...EMIR, saglamAdet: -1 }), false);
});

test('canlı: başlamamış emirde null kalır, sıfıra çevrilmez; başlamış emirde sıfır sayaç sıfır kalır', () => {
  assert.equal(emirSemasi.parse({ ...EMIR, canli: null }).canli, null);
  const baslamis = { ...EMIR, durum: 'basladi', baslama: KAYIT.zaman, canli: CANLI };
  assert.deepEqual(emirSemasi.parse(baslamis), baslamis);
  // Sayaç yoksa bütün nesne null olur; eksik ya da null sayaç "sıfır" diye geçmez.
  for (const alan of ['saglam', 'hurda']) {
    for (const deger of [null, undefined, -1, 1.5]) assert.equal(gecer(canliSemasi, { ...CANLI, [alan]: deger }), false, `${alan} ${String(deger)}`);
  }
});

test('canlı: çalışma üç durumdan biridir, biten emirde null; duruş nedeni ve başlangıcı açıkça null yazılır', () => {
  for (const calisma of ['calisiyor', 'durakli', 'durdu', null]) assert.equal(gecer(canliSemasi, { ...CANLI, calisma }), true, String(calisma));
  for (const calisma of ['bitti', 'sirada', undefined]) assert.equal(gecer(canliSemasi, { ...CANLI, calisma }), false, String(calisma));
  const durmus = { ...CANLI, calisma: 'durdu', saglam: 7, hurda: 2, durusNedeni: { id: 6, ad: 'Deneme neden' }, durusBaslangic: KAYIT.zaman };
  assert.deepEqual(canliSemasi.parse(durmus), durmus);
  for (const alan of ['durusNedeni', 'durusBaslangic']) assert.equal(gecer(canliSemasi, { ...CANLI, [alan]: undefined }), false, alan);
});

test('adım cevabı: işaretlenmemiş adımda kim ve ne zaman null kalır; eksik alan reddedilir, fazlası dışarı çıkmaz', () => {
  const adim = { id: 1, sira: 1, ad: 'Ölç', aciklama: null, tamam: false, tamamlayan: null, tamamlanma: null };
  const isaretli = { ...adim, id: 2, sira: 2, tamam: true, tamamlayan: { id: 2, ad: 'Deneme Kişi' }, tamamlanma: KAYIT.zaman };
  assert.deepEqual(adimCevabi.parse({ emir: EMIR, adimlar: [{ ...adim, zorunlu: true }, isaretli] }), { emir: EMIR, adimlar: [adim, isaretli] });
  for (const alan of ['aciklama', 'tamam', 'tamamlayan', 'tamamlanma']) {
    assert.equal(gecer(adimCevabi, { emir: EMIR, adimlar: [{ ...adim, [alan]: undefined }] }), false, alan);
  }
  assert.equal(gecer(adimCevabi, { emir: EMIR }), false);
  assert.deepEqual(emirAyrintiCevabi.parse({ emir: EMIR, kayitlar: [], adimlar: [adim] }).adimlar, [adim]);
});

test('kayıt: olay defterin yedi olayından biridir; hurda ve duruş nedenini, düzeltme eksi adedi taşır; ayrıntı cevabı şemada olmayan alanı dışarı çıkarmaz', () => {
  assert.deepEqual(kayitSemasi.parse(KAYIT), KAYIT);
  assert.deepEqual(kayitSemasi.parse({ ...KAYIT, olay: 'bitir', saglamAdet: 4 }), { ...KAYIT, olay: 'bitir', saglamAdet: 4 });
  for (const olay of ['duraklat', 'durdur', 'devam', 'hurda', 'duzeltme']) assert.equal(gecer(kayitSemasi, { ...KAYIT, olay }), true, olay);
  for (const olay of ['iptal', 'saglam', 'sayim']) assert.equal(gecer(kayitSemasi, { ...KAYIT, olay }), false, olay);
  const hurda = { ...KAYIT, olay: 'hurda', adet: 2, hurdaNedeni: { id: 4, ad: 'Deneme hurda' }, durusNedeni: null };
  assert.deepEqual(kayitSemasi.parse(hurda), hurda);
  const durdur = { ...KAYIT, olay: 'durdur', adet: null, hurdaNedeni: null, durusNedeni: { id: 6, ad: 'Deneme neden' } };
  assert.deepEqual(kayitSemasi.parse(durdur), durdur);
  assert.equal(kayitSemasi.parse({ ...KAYIT, olay: 'duzeltme', adet: -3 }).adet, -3);
  assert.equal(gecer(kayitSemasi, { ...KAYIT, olay: 'hurda', adet: 1.5 }), false);
  assert.equal(gecer(kayitSemasi, { ...KAYIT, olay: 'hurda', hurdaNedeni: { id: 4 } }), false);
  assert.deepEqual(
    emirAyrintiCevabi.parse({ emir: { ...EMIR, hurdaAdet: 2 }, kayitlar: [{ ...KAYIT, sure: 30 }] }),
    { emir: EMIR, kayitlar: [KAYIT] },
  );
});
