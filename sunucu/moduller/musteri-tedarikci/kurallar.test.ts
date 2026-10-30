import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADRES_SINIRI, FIRMA_ARAMA_SINIRI } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  adresSiniriHatasi, aramaSiniri, defterFarki, durumGecisiHatasi, firmaAramaSonucu, firmaKaydiHatasi, koordinatHatasi, logoKilidiIhlali, turKapsami, vergiNoHatasi,
} from './kurallar.ts';

test('MT-1 (D-9): Türkiye\'deki firmada vergi numarası 10 ya da 11 rakamdır; harf ve kısa numara reddedilir', () => {
  assert.equal(vergiNoHatasi('TR', '1234567890'), null);
  assert.equal(vergiNoHatasi('TR', '12345678901'), null);
  assert.equal(vergiNoHatasi('TR', null), null);
  assert.notEqual(vergiNoHatasi('TR', '123456789'), null);
  assert.notEqual(vergiNoHatasi('TR', '123456789012'), null);
  assert.notEqual(vergiNoHatasi('TR', 'TR12345678'), null);
});

test('MT-1 (D-9): yabancı firmada vergi numarası serbest metindir; yalnız 30 karakter sınırı vardır', () => {
  assert.equal(vergiNoHatasi('DE', 'DE-999 000 111'), null);
  assert.equal(vergiNoHatasi('DE', 'X'.repeat(30)), null);
  assert.notEqual(vergiNoHatasi('DE', 'X'.repeat(31)), null);
  assert.deepEqual(firmaKaydiHatasi({ ulkeKodu: 'TR', vergiNo: '12', enlem: null, boylam: null })?.alan, 'vergiNo');
  assert.equal(firmaKaydiHatasi({ ulkeKodu: 'DE', vergiNo: '12', enlem: null, boylam: null }), null);
});

test('MT-5 (FNS-45): Logo kayıt numarası dolu firmanın kodu ve Logo cari kodu değişemez; numarası boş firmada değişebilir', () => {
  const gonderilmis = { logoKayitNo: 77, kod: 'F-1', logoCariKodu: 'C-1' };
  assert.equal(logoKilidiIhlali(gonderilmis, { kod: 'F-1', logoCariKodu: 'C-1' }), false);
  assert.equal(logoKilidiIhlali(gonderilmis, { kod: 'F-2', logoCariKodu: 'C-1' }), true);
  assert.equal(logoKilidiIhlali(gonderilmis, { kod: 'F-1', logoCariKodu: 'c-1' }), true);
  assert.equal(logoKilidiIhlali(gonderilmis, { kod: null, logoCariKodu: 'C-1' }), true);
  assert.equal(logoKilidiIhlali({ ...gonderilmis, logoKayitNo: null }, { kod: 'F-2', logoCariKodu: null }), false);
});

test('MT-8 (FNS-53): pasife alma yalnız aktif firmada, aktif yapma yalnız pasif firmada geçer', () => {
  assert.equal(durumGecisiHatasi(true, 'pasif'), null);
  assert.equal(durumGecisiHatasi(false, 'aktif'), null);
  assert.notEqual(durumGecisiHatasi(false, 'pasif'), null);
  assert.notEqual(durumGecisiHatasi(true, 'aktif'), null);
});

test('MT-2: tür süzgeci: müşteri ya da tedarikçi isteyen "ikisi"ni de görür; "ikisi" yalnız kendisini getirir', () => {
  assert.equal(turKapsami(undefined), null);
  assert.deepEqual(turKapsami('musteri'), ['musteri', 'ikisi']);
  assert.deepEqual(turKapsami('tedarikci'), ['tedarikci', 'ikisi']);
  assert.deepEqual(turKapsami('ikisi'), ['ikisi']);
});

test('MT-3 (FNS-49): arama sınırı 1 ile 50 arasına çekilir; aşan istek reddedilmez', () => {
  assert.equal(aramaSiniri(10), 10);
  assert.equal(aramaSiniri(500), FIRMA_ARAMA_SINIRI);
  assert.equal(aramaSiniri(0), 1);
  assert.equal(aramaSiniri(Number.NaN), FIRMA_ARAMA_SINIRI);
});

test('MT-7: enlem ve boylam birlikte verilir; yalnız biri dolu koordinat reddedilir', () => {
  assert.equal(koordinatHatasi({ enlem: 39.9, boylam: 32.8 }), null);
  assert.equal(koordinatHatasi({ enlem: null, boylam: null }), null);
  assert.equal(koordinatHatasi({ enlem: 39.9, boylam: null })?.alan, 'boylam');
  assert.equal(koordinatHatasi({ enlem: null, boylam: 32.8 })?.alan, 'enlem');
  assert.equal(firmaKaydiHatasi({ ulkeKodu: 'TR', vergiNo: null, enlem: 39.9, boylam: null })?.alan, 'boylam');
});

test('MT-10: bir firmaya en çok ADRES_SINIRI adres eklenir', () => {
  assert.equal(adresSiniriHatasi(ADRES_SINIRI - 1), null);
  assert.notEqual(adresSiniriHatasi(ADRES_SINIRI), null);
});

test('denetim eki: yalnız değişen alan yazılır; sürüm ve zaman alanı yazılmaz', () => {
  const satirlar = defterFarki('firma:1', { ad: 'A', il: 'X', surum: 1 }, { ad: 'B', il: 'X', surum: 2 });
  assert.deepEqual(satirlar, [{ kayit: 'firma:1', alan: 'ad', onceki: 'A', yeni: 'B' }]);
});

test('Ctrl K firma sonucu (kart 1235): başlık kod, kodsuz kartta ad; açıklama tür, fason ve pasif; yol kartı açar', () => {
  const temel = { id: 7, kod: 'F-7', ad: 'Ornek Firma', tur: 'tedarikci', fason: false, aktif: true } as const;
  assert.deepEqual(firmaAramaSonucu(temel), { anahtar: '7', baslik: 'F-7', aciklama: 'Ornek Firma · Tedarikçi', yol: '/musteri-tedarikci?firma=7' });
  assert.deepEqual(firmaAramaSonucu({ ...temel, kod: null, fason: true, aktif: false }).baslik, 'Ornek Firma');
  assert.equal(firmaAramaSonucu({ ...temel, kod: '  ', fason: true, aktif: false }).aciklama, 'Tedarikçi · Fason · Pasif');
});
