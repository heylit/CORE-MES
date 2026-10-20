import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adresSiniriHatasi, aramaSiniri, defterFarki, durumGecisiHatasi, koordinatHatasi, logoKilidiIhlali, turKapsami, vergiNoHatasi } from './kurallar.ts';

// Bugünkü davranışın kaydı: düzeltmeden önce çıktılar sabitlenir, değişiklik bu testleri bilerek günceller.

test('MT-HESAP: Türkiye vergi no 10, kimlik no 11 hane; yabancı ülke ve boş değer serbest', () => {
  assert.deepEqual([vergiNoHatasi('TR', '123'), vergiNoHatasi('TR', '1234567890'), vergiNoHatasi('TR', '12345678901'), vergiNoHatasi('DE', 'DE123456789'), vergiNoHatasi('TR', null)],
    ["Türkiye'deki firmada vergi numarası 10, T.C. kimlik numarası 11 rakamdır.", null, null, null, null]);
});

test('MT-HESAP: enlem ve boylam birlikte girilir ya da ikisi de boş kalır', () => {
  assert.deepEqual([koordinatHatasi({ enlem: 39.9, boylam: null }), koordinatHatasi({ enlem: null, boylam: null }), koordinatHatasi({ enlem: 39.9, boylam: 32.8 })],
    [{ alan: 'boylam', ileti: 'Enlem ve boylam birlikte girilir.' }, null, null]);
});

test('MT-HESAP: Logo kayıtlı firmada kod değişimi (büyük-küçük harf dahil) kilide takılır', () => {
  assert.equal(logoKilidiIhlali({ logoKayitNo: 5, kod: 'A', logoCariKodu: 'C1' }, { kod: 'a', logoCariKodu: 'C1' }), true);
  assert.equal(logoKilidiIhlali({ logoKayitNo: null, kod: 'A', logoCariKodu: null }, { kod: 'B', logoCariKodu: null }), false);
});

test('MT-HESAP: aynı duruma geçiş hata verir', () => {
  assert.deepEqual([durumGecisiHatasi(true, 'pasif'), durumGecisiHatasi(false, 'pasif'), durumGecisiHatasi(true, 'aktif')], [null, 'Firma zaten pasif.', 'Firma zaten aktif.']);
});

test('MT-HESAP: tür kapsamı "ikisi" türünü de içerir; tür yoksa null', () => {
  assert.deepEqual([turKapsami(undefined), turKapsami('musteri'), turKapsami('ikisi')], [null, ['musteri', 'ikisi'], ['ikisi']]);
});

test('MT-HESAP: arama sınırı 1-50 arasına çekilir; sayı değilse 50', () => {
  assert.deepEqual([aramaSiniri(10), aramaSiniri(500), aramaSiniri(0), aramaSiniri(NaN)], [10, 50, 1, 50]);
});

test('MT-HESAP: firma başına en çok 50 adres', () => {
  assert.deepEqual([adresSiniriHatasi(49), adresSiniriHatasi(50)], [null, 'Bir firmaya en çok 50 adres eklenir.']);
});

test('MT-HESAP: defter farkı değişen alanları yazar, sürüm alanını yazmaz', () => {
  assert.deepEqual(defterFarki('firma:7', { il: null, ilce: 'Ankara', surum: 1 }, { il: 'Ankara', ilce: null, surum: 2 }), [
    { kayit: 'firma:7', alan: 'il', onceki: null, yeni: 'Ankara' },
    { kayit: 'firma:7', alan: 'ilce', onceki: 'Ankara', yeni: null },
  ]);
});
