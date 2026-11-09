import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADRES_SINIRI, FIRMA_ARAMA_SINIRI } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  adresSiniriHatasi, aramaSiniri, defterFarki, durumGecisiHatasi, firmaAramaSonucu, firmaKaydiHatasi, agirlikSurumHatasi, bilesenPuani, ellePuani, karneDonemi, karneHesapla, karneSinifiBul,
  fasonTuruHatasi, karneYazmaHatasi, koordinatHatasi, logoKilidiIhlali, musteriSinifiTuru, turKapsami, vergiNoHatasi, zamanindaMi,
} from './kurallar.ts';
import type { KarneAgirliklari } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { KarneSayilari } from './kurallar.ts';

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
  assert.deepEqual(firmaKaydiHatasi({ ulkeKodu: 'TR', vergiNo: '12', enlem: null, boylam: null, tur: 'musteri', fason: false })?.alan, 'vergiNo');
  assert.equal(firmaKaydiHatasi({ ulkeKodu: 'DE', vergiNo: '12', enlem: null, boylam: null, tur: 'musteri', fason: false }), null);
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
  assert.equal(firmaKaydiHatasi({ ulkeKodu: 'TR', vergiNo: null, enlem: 39.9, boylam: null, tur: 'musteri', fason: false })?.alan, 'boylam');
});

test('MT-20: fason işareti tedarikçi ve ikisi türünde geçer; müşteri türünde alan adıyla reddedilir', () => {
  assert.equal(fasonTuruHatasi({ tur: 'tedarikci', fason: true }), null);
  assert.equal(fasonTuruHatasi({ tur: 'ikisi', fason: true }), null);
  assert.equal(fasonTuruHatasi({ tur: 'musteri', fason: false }), null);
  assert.equal(fasonTuruHatasi({ tur: 'musteri', fason: true })?.alan, 'fason');
  assert.equal(firmaKaydiHatasi({ ulkeKodu: 'TR', vergiNo: null, enlem: null, boylam: null, tur: 'musteri', fason: true })?.alan, 'fason');
});

test('MT-21: müşteri sınıfı müşteri ve ikisi türünde kalır; tedarikçide boşa çekilir', () => {
  assert.equal(musteriSinifiTuru('musteri', 'A'), 'A');
  assert.equal(musteriSinifiTuru('ikisi', 'B'), 'B');
  assert.equal(musteriSinifiTuru('tedarikci', 'C'), null);
  assert.equal(musteriSinifiTuru('tedarikci', null), null);
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

test('MT-14: karne dönemi tesis gününde biten 12 aydır; kısa ayda ayın son gününe çekilir', () => {
  assert.deepEqual(karneDonemi('2026-10-30'), { donemBasi: '2025-10-30', donemSonu: '2026-10-30' });
  assert.deepEqual(karneDonemi('2028-02-29'), { donemBasi: '2027-02-28', donemSonu: '2028-02-29' });
  assert.deepEqual(karneDonemi('2026-01-01'), { donemBasi: '2025-01-01', donemSonu: '2026-01-01' });
});

test('MT-15: teslim termin + 2 gün içindeyse zamanındadır; tamlık zamanlılığa girmez (sürüm 2)', () => {
  assert.equal(zamanindaMi({ termin: '2026-10-28', teslimGunu: '2026-10-20' }), true);
  assert.equal(zamanindaMi({ termin: '2026-10-28', teslimGunu: '2026-10-30' }), true);
  assert.equal(zamanindaMi({ termin: '2026-10-28', teslimGunu: '2026-10-31' }), false);
  assert.equal(zamanindaMi({ termin: '2026-12-31', teslimGunu: '2027-01-02' }), true);
});

const AGIRLIK: KarneAgirliklari = { lot: 25, ppm: 15, zamaninda: 25, tam: 10, teklif: 5, satinAlma: 10, kalite: 10 };
const sayilar = (ek: Partial<KarneSayilari> = {}): KarneSayilari => ({
  teslimToplam: 10, teslimZamaninda: 9, teslimTam: 8, lotKararlari: { kabul: 3, sartli_kabul: 1 },
  satinAlma: { sayi: 2, toplam: 9 }, kalite: { sayi: 1, toplam: 5 }, ...ek,
});

test('MT-16, MT-32: puan verisi olan bileşenlerin ağırlıklı ortalamasıdır; PPM ve teklif yokken ağırlıkları dağılır', () => {
  const k = karneHesapla(sayilar(), AGIRLIK, 2);
  assert.deepEqual(k.teslim, { toplam: 10, zamaninda: 9, tam: 8, oran: 90 });
  assert.deepEqual(k.kalite, { lot: 4, kararlar: { kabul: 3, sartli_kabul: 1 }, puan: 87.5 });
  assert.deepEqual(k.hizmet, { sayi: 2, ortalama: 4.5, puan: 87.5 });
  assert.deepEqual(k.kaliteDegerlendirmesi, { sayi: 1, ortalama: 5, puan: 100 });
  assert.equal(k.puan, 88.9);
  assert.equal(k.sinif, 'B');
  assert.equal(k.hesapSurumu, 2);
  assert.equal(k.yetersizVeri, false);
  const lot = k.bilesenler.find((b) => b.anahtar === 'lot')!;
  assert.deepEqual(lot, { anahtar: 'lot', deger: 87.5, agirlik: 25, etkinAgirlik: 31.3 });
  assert.deepEqual(k.bilesenler.find((b) => b.anahtar === 'ppm'), { anahtar: 'ppm', deger: null, agirlik: 15, etkinAgirlik: null });
  assert.deepEqual([90, 89.9, 75, 74.9, 60, 59.9, 0].map(karneSinifiBul), ['A', 'B', 'B', 'C', 'C', 'D', 'D']);
  assert.deepEqual(k.gruplar, { kalite: 87.5, teslim: 87.1, elle: 93.8 });
});

test('MT-16: red ve iade lotu sıfır, hatalı kabul yarım sayılır; elle puan yoksa sıfır değil null sayılır', () => {
  const k = karneHesapla(sayilar({ lotKararlari: { kabul: 1, hatali_kabul: 1, red: 1, iade: 1 }, satinAlma: { sayi: 0, toplam: 0 }, kalite: { sayi: 0, toplam: 0 } }), AGIRLIK, 2);
  assert.equal(k.kalite.puan, 37.5);
  assert.equal(k.hizmet.puan, null);
  assert.equal(k.puan, 66.5);
  assert.equal(k.sinif, 'C');
});

test('MT-16: eksik teslim zamanlılıktan değil yalnız tam teslim bileşeninden düşer', () => {
  const k = karneHesapla(sayilar({ teslimToplam: 4, teslimZamaninda: 4, teslimTam: 2 }), AGIRLIK, 2);
  assert.equal(k.teslim.oran, 100);
  assert.equal(k.bilesenler.find((b) => b.anahtar === 'tam')!.deger, 50);
});

test('MT-16: 3 teslim ve 3 lottan az veride sınıf verilmez, puan verisi olan bileşenle gösterilir; veri yoksa null', () => {
  const az = karneHesapla(sayilar({ teslimToplam: 2, teslimZamaninda: 2, teslimTam: 2 }), AGIRLIK, 2);
  assert.equal(az.yetersizVeri, true);
  assert.notEqual(az.puan, null);
  assert.equal(az.sinif, null);
  const bos = karneHesapla({ teslimToplam: 0, teslimZamaninda: 0, teslimTam: 0, lotKararlari: {}, satinAlma: { sayi: 0, toplam: 0 }, kalite: { sayi: 0, toplam: 0 } }, AGIRLIK, 2);
  assert.deepEqual([bos.teslim.oran, bos.kalite.puan, bos.hizmet.puan, bos.puan, bos.sinif], [null, null, null, null, null]);
  assert.equal(karneHesapla(sayilar({ lotKararlari: { kabul: 2 } }), AGIRLIK, 2).yetersizVeri, true);
});

test('MT-31: elle 1-5 puan (p - 1) x 25 ile 0-100 olur; değerlendirme yoksa null', () => {
  assert.deepEqual(ellePuani({ sayi: 1, toplam: 1 }), { ortalama: 1, puan: 0 });
  assert.deepEqual(ellePuani({ sayi: 2, toplam: 10 }), { ortalama: 5, puan: 100 });
  assert.deepEqual(ellePuani({ sayi: 3, toplam: 10 }), { ortalama: 3.3, puan: 58.3 });
  assert.deepEqual(ellePuani({ sayi: 0, toplam: 0 }), { ortalama: null, puan: null });
});

test('MT-32: hiçbir bileşenin ağırlığı yoksa puan null; sıfır ağırlıklı bileşen etkin ağırlık 0 alır', () => {
  const sifir: KarneAgirliklari = { lot: 0, ppm: 0, zamaninda: 0, tam: 0, teklif: 0, satinAlma: 0, kalite: 100 };
  const bos = bilesenPuani({ lot: 90, ppm: null, zamaninda: 80, tam: null, teklif: null, satinAlma: null, kalite: null }, sifir);
  assert.equal(bos.puan, null);
  const tek = bilesenPuani({ lot: 90, ppm: null, zamaninda: 80, tam: null, teklif: null, satinAlma: null, kalite: 40 }, sifir);
  assert.equal(tek.puan, 40);
  assert.equal(tek.bilesenler.find((b) => b.anahtar === 'lot')!.etkinAgirlik, 0);
});

test('MT-32: otomatik bileşenlerin hiçbirinde veri yoksa elle puanlar karne puanı vermez', () => {
  const k = karneHesapla({ teslimToplam: 0, teslimZamaninda: 0, teslimTam: 0, lotKararlari: {}, satinAlma: { sayi: 1, toplam: 5 }, kalite: { sayi: 1, toplam: 4 } }, AGIRLIK, 2);
  assert.equal(k.puan, null);
  assert.equal(k.sinif, null);
  assert.deepEqual(k.gruplar, { kalite: null, teslim: null, elle: 87.5 });
  assert.equal(k.bilesenler.find((b) => b.anahtar === 'satinAlma')!.deger, 100);
  assert.equal(k.bilesenler.find((b) => b.anahtar === 'satinAlma')!.etkinAgirlik, null);
});

test('MT-33: ağırlık değişikliği okunan sürüm geçerli değilse reddedilir', () => {
  assert.equal(agirlikSurumHatasi(3, 3), null);
  assert.notEqual(agirlikSurumHatasi(2, 3), null);
});

test('MT-17: karne yalnız tedarikçi ya da ikisi türündeki firmaya yazılır', () => {
  assert.equal(karneYazmaHatasi('tedarikci'), null);
  assert.equal(karneYazmaHatasi('ikisi'), null);
  assert.notEqual(karneYazmaHatasi('musteri'), null);
});

test('MT-30 (2118): Logo carisinin türü, kod sınırı, bağlanabilirlik ve bellek süresi', async () => {
  const k = await import('./kurallar.ts');
  assert.deepEqual([1, 2, 3, null, 7].map(k.logoCariTuru), ['musteri', 'tedarikci', 'ikisi', 'ikisi', 'ikisi']);
  assert.equal(k.logoCariKoduHatasi('LG.1'), null);
  assert.notEqual(k.logoCariKoduHatasi('X'.repeat(41)), null);
  assert.notEqual(k.logoCariKoduHatasi(' LG.1'), null);
  assert.equal(k.logoyaBaglanabilir({ logoKayitNo: null, logoCariKodu: null }, 'LG.1'), true);
  assert.equal(k.logoyaBaglanabilir({ logoKayitNo: null, logoCariKodu: 'lg.1' }, 'LG.1'), true);
  assert.equal(k.logoyaBaglanabilir({ logoKayitNo: null, logoCariKodu: 'LG.2' }, 'LG.1'), false);
  assert.equal(k.logoyaBaglanabilir({ logoKayitNo: 9, logoCariKodu: null }, 'LG.1'), false);
  assert.equal(k.logoCariBellegiGecerliMi(1000, 1000 + k.LOGO_CARI_BELLEK_MS - 1), true);
  assert.equal(k.logoCariBellegiGecerliMi(1000, 1000 + k.LOGO_CARI_BELLEK_MS), false);
  assert.equal(k.logoCariBellegiGecerliMi(1000, 999), false);
});
