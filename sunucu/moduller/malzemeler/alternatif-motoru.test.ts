import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KAPSAM_DOGRULAMA, alternatifEtiketi, alternatifKartAdi, sinirHatasi, uyanKurallar, zarfaGirenler, zarfDegerlendir, zarfHesapla,
  type KuralSatiri, type SinirSatiri, type ZarfKarti,
} from './alternatif/kurallar.ts';
import type { DurumMuadili, KaliteMuadili } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';

const kart: ZarfKarti = { no: 42, aile: 'metal', sinif: 'aluminyum', kalite: '6082', durum: 'T6', yuzey: 'Ham', form: 'cubuk', olcu: { d: 50, l: 3000 } };
const km: KaliteMuadili[] = [
  { kalite: '6082', muadil: '6061', tur: 'tam', notu: null, surum: 1 },
  { kalite: '6082', muadil: '7075', tur: 'ust', notu: null, surum: 1 },
  { kalite: '6082', muadil: '6060', tur: 'sartli', notu: 'Dayanım düşük', surum: 1 },
  { kalite: '304', muadil: '316', tur: 'ust', notu: null, surum: 1 },
];
const dm: DurumMuadili[] = [{ durum: 'T6', muadil: 'T651', tur: 'ust', notu: null, surum: 1 }];
const bos: Omit<KuralSatiri, 'kapsamTuru' | 'kapsam'> = {
  kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null, payTuru: null, payDeger: null, payEnAzMm: null, kapali: null, gerekce: null,
};
const kural = (kapsamTuru: KuralSatiri['kapsamTuru'], kapsam: string, a: Partial<KuralSatiri> = {}): KuralSatiri => ({ ...bos, kapsamTuru, kapsam, ...a });
const aday = (a: Partial<ZarfKarti>): ZarfKarti => ({ ...kart, no: 99, ...a });

test('kural yoksa varsayılanlar: pay +%15 en az 3 mm, şartlı kapalı, uzun boy kesilir, yüzey aynı', () => {
  const z = zarfHesapla(kart, [], km, dm);
  assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 57.5, sinirKaynak: null }]);
  assert.equal(z.sartliAcik, false);
  assert.equal(z.boy?.uzunKesilir, true);
  assert.equal(z.yuzey.serbest, false);
  assert.equal(z.kapali, false);
  assert.deepEqual(z.kalite.secenekler.map((s) => s.deger), ['6061', '7075', '6060']);
  assert.equal(z.pay.kaynak, null);
});

test('dar kapsam geniş olanı ezer; boş alan miras kalır', () => {
  const kurallar = [
    kural('aile', 'metal', { payTuru: 'yuzde', payDeger: 15, payEnAzMm: 3, yuzeySerbest: true }),
    kural('sinif', 'metal/aluminyum', { payTuru: 'mm', payDeger: 5 }),
    kural('kart', '42', { sartliAcik: true }),
    kural('sinif', 'polimer/aluminyum', { payTuru: 'tam' }),
  ];
  assert.deepEqual(uyanKurallar(kart, kurallar).map((r) => r.kapsamTuru), ['kart', 'sinif', 'aile']);
  const z = zarfHesapla(kart, kurallar, km, dm);
  assert.equal(z.olcu[0]!.enCok, 55);
  assert.deepEqual(z.pay.kaynak, { kapsamTuru: 'sinif', kapsam: 'metal/aluminyum' });
  assert.equal(z.yuzey.serbest, true);
  assert.deepEqual(z.yuzey.kaynak, { kapsamTuru: 'aile', kapsam: 'metal' });
  assert.equal(z.sartliAcik, true);
});

test('değerlendirme: aynı, içinde, şartlı ve dışı', () => {
  const z = zarfHesapla(kart, [kural('sinif', 'metal/aluminyum', { payTuru: 'mm', payDeger: 5 })], km, dm);
  assert.equal(zarfDegerlendir(z, aday({})).sonuc, 'ayni');
  assert.equal(zarfDegerlendir(z, aday({ kalite: '6061', durum: 'T651', olcu: { d: 52, l: 3000 } })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ kalite: '6060' })).sonuc, 'sartli');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 56, l: 3000 } })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 49, l: 3000 } })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ kalite: '304' })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ form: 'altigen', olcu: { s: 50, l: 3000 } })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 2000 } })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 6000 } })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ yuzey: 'Eloksal' })).sonuc, 'disi');
});

test('kalite yalnız aynı ve kapalı kart', () => {
  const kapali = zarfHesapla(kart, [kural('kart', '42', { kapali: true, gerekce: 'Müşteri şartı' })], km, dm);
  assert.equal(kapali.kapali, true);
  assert.equal(kapali.gerekce, 'Müşteri şartı');
  assert.equal(zarfDegerlendir(kapali, aday({ kalite: '6061' })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(kapali, aday({})).sonuc, 'ayni');
  const yalniz = zarfHesapla(kart, [kural('kalite', '6082', { kaliteAcik: false })], km, dm);
  assert.equal(zarfDegerlendir(yalniz, aday({ kalite: '6061' })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(yalniz, aday({ durum: 'T651' })).sonuc, 'icinde');
});

test('lama ve blokta ölçüler döndürülerek eşlenir; boruda iç çap büyüyemez', () => {
  const lama: ZarfKarti = { ...kart, form: 'lama', olcu: { a: 40, b: 10, l: 3000 } };
  const z = zarfHesapla(lama, [kural('kart', '42', { payTuru: 'mm', payDeger: 5 })], km, dm);
  assert.equal(zarfDegerlendir(z, aday({ form: 'lama', olcu: { a: 12, b: 42, l: 3000 } })).sonuc, 'icinde');
  const boru: ZarfKarti = { ...kart, form: 'boru', olcu: { D: 50, t: 5, l: 3000 } };
  const zb = zarfHesapla(boru, [kural('kart', '42', { payTuru: 'mm', payDeger: 5 })], km, dm);
  assert.equal(zarfDegerlendir(zb, aday({ form: 'boru', olcu: { D: 54, t: 7, l: 3000 } })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(zb, aday({ form: 'boru', olcu: { D: 54, t: 5, l: 3000 } })).sonuc, 'disi');
});

test('yüzdeli payda küçük ölçüde en az mm uygulanır; tam payda yalnız aynı ölçü', () => {
  const kucuk: ZarfKarti = { ...kart, olcu: { d: 10, l: 3000 } };
  const z = zarfHesapla(kucuk, [], km, dm);
  assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 10, enAz: 10, enCok: 13, sinirKaynak: null }]);
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 13, l: 3000 } })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 13.5, l: 3000 } })).sonuc, 'disi');
  const tam = zarfHesapla(kart, [kural('kart', '42', { payTuru: 'tam' })], km, dm);
  assert.equal(zarfDegerlendir(tam, aday({ olcu: { d: 50, l: 3000 } })).sonuc, 'ayni');
  assert.equal(zarfDegerlendir(tam, aday({ olcu: { d: 51, l: 3000 } })).sonuc, 'disi');
});

test('uzun boy kesilmez kuralında uzun boy dışı; boruda et kalınlığı farkı nedeniyle içinde; farklı form dışı', () => {
  const z = zarfHesapla(kart, [kural('kart', '42', { boyUzunKesilir: false })], km, dm);
  assert.deepEqual(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 6000 } })), { sonuc: 'disi', nedenler: ['Boy farklı'] });
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 3000 } })).sonuc, 'ayni');
  const boru: ZarfKarti = { ...kart, form: 'boru', olcu: { D: 50, t: 5, l: 3000 } };
  const zb = zarfHesapla(boru, [], km, dm);
  const et = zarfDegerlendir(zb, aday({ form: 'boru', olcu: { D: 50, t: 6, l: 3000 } }));
  assert.equal(et.sonuc, 'icinde');
  assert.ok(et.nedenler.some((n) => n.startsWith('t ')), et.nedenler.join('; '));
  assert.deepEqual(zarfDegerlendir(z, aday({ form: 'altigen', olcu: { d: 50, l: 3000 } })), { sonuc: 'disi', nedenler: ['Form farklı'] });
});

test('zarfa girenler kartın kendisini ve dışarıdakileri çıkarır, sıralar', () => {
  const z = zarfHesapla(kart, [], km, dm);
  const l = zarfaGirenler(z, kart, [aday({ no: 3, kalite: '6060' }), aday({ no: 42 }), aday({ no: 5, kalite: '6061' }), aday({ no: 7 }), aday({ no: 8, kalite: '304' })]);
  assert.deepEqual(l.map((a) => [a.no, a.sonuc]), [[7, 'ayni'], [5, 'icinde'], [3, 'sartli']]);
});

test('kapsam ve pay doğrulaması', () => {
  assert.equal(KAPSAM_DOGRULAMA.kapsamHatasi('kart', 'ORN-1'), 'Kart kapsamı kart numarası olmalı.');
  assert.equal(KAPSAM_DOGRULAMA.kapsamHatasi('sinif', 'aluminyum'), 'Sınıf kapsamı "aile/sınıf" biçiminde olmalı.');
  assert.equal(KAPSAM_DOGRULAMA.kapsamHatasi('sinif', 'metal/aluminyum'), null);
  assert.equal(KAPSAM_DOGRULAMA.payHatasi('mm', null, null), 'Pay değeri girin.');
  assert.equal(KAPSAM_DOGRULAMA.payHatasi('mm', 5, 3), 'En az mm yalnız yüzdeli payda girilir.');
  assert.equal(KAPSAM_DOGRULAMA.payHatasi('tam', null, null), null);
  assert.equal(KAPSAM_DOGRULAMA.payHatasi(null, 5, null), 'Pay türü seçilmeden değer girilemez.');
});

test('3b-2: alternatif kartının adı ana adı korur, etiket ölçüyü mm ile yazar ve sınırda kısalır', () => {
  const e = alternatifEtiketi({ kalite: '6262', durum: null, yuzey: null, olcu: { l: 3200, d: 52.5 } });
  assert.equal(e, '6262 d 52,5 mm l 3.200 mm');
  assert.equal(alternatifKartAdi('Örnek çubuk', e), 'Örnek çubuk (alternatif 6262 d 52,5 mm l 3.200 mm)');
  const uzun = 'Ö'.repeat(180);
  const ad = alternatifKartAdi(uzun, e);
  assert.deepEqual([ad.length, ad.startsWith(uzun), ad.endsWith(')')], [200, true, true]);
  assert.equal(alternatifKartAdi('Ö'.repeat(205), e), 'Ö'.repeat(200));
  assert.equal(alternatifEtiketi({ kalite: null, durum: null, yuzey: null, olcu: {} }), 'alternatif');
});

// 3463-1: kartta seçilen kabul sınırı.
const sinir = (kapsamTuru: SinirSatiri['kapsamTuru'], kapsam: string, nitelik: SinirSatiri['nitelik'], a: Partial<SinirSatiri> = {}): SinirSatiri =>
  ({ kapsamTuru, kapsam, nitelik, degerler: null, alt: null, ust: null, ...a });

test('sınır yoksa zarf 3437 ile aynıdır; başka karta ait sınır zarfı değiştirmez (Risk K2)', () => {
  const kurallar = [kural('sinif', 'metal/aluminyum', { payTuru: 'mm', payDeger: 5, yuzeySerbest: true })];
  const once = zarfHesapla(kart, kurallar, km, dm);
  const sonra = zarfHesapla(kart, kurallar, km, dm, [sinir('kart', '7', 'd', { alt: 40, ust: 60 }), sinir('kalite', '304', 'kalite', { degerler: [] })]);
  assert.deepEqual(sonra, once);
  for (const a of [aday({ olcu: { d: 53, l: 3000 } }), aday({ kalite: '6060' }), aday({ yuzey: 'Taşlanmış' })]) {
    assert.deepEqual(zarfDegerlendir(sonra, a), zarfDegerlendir(once, a));
  }
});

test('ölçü aralığı payın yerine geçer; alt sınır istenenin altına inebilir, dar kapsam geniş olanı ezer', () => {
  const s = [sinir('sinif', 'metal/aluminyum', 'd', { alt: 50, ust: 52 }), sinir('kart', '42', 'd', { alt: 49, ust: 55 })];
  const z = zarfHesapla(kart, [], km, dm, s);
  assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 50, enAz: 49, enCok: 55, sinirKaynak: { kapsamTuru: 'kart', kapsam: '42' } }]);
  assert.deepEqual(zarfDegerlendir(z, aday({ olcu: { d: 49, l: 3000 } })), { sonuc: 'icinde', nedenler: ['d -1 mm'] });
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 48.9, l: 3000 } })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 55, l: 3000 } })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 56, l: 3000 } })).sonuc, 'disi');
  const yalnizUst = zarfHesapla(kart, [], km, dm, [sinir('kart', '42', 'd', { ust: 51 })]);
  assert.deepEqual([yalnizUst.olcu[0]!.enAz, yalnizUst.olcu[0]!.enCok], [50, 51]);
});

test('kalite listesi muadil tablosunun yerine geçer; listede olmayan sınır dışı, şartlı izin ister', () => {
  const z = zarfHesapla(kart, [kural('kart', '42', { kaliteAcik: false })], km, dm, [
    sinir('kalite', '6082', 'kalite', { degerler: [{ deger: '6082', tur: 'tam' }, { deger: '7075', tur: 'ust' }, { deger: '5083', tur: 'sartli' }] }),
  ]);
  assert.deepEqual([z.kalite.sinir, z.kalite.acik, z.kalite.secenekler.map((x) => x.deger)], [true, true, ['7075', '5083']]);
  assert.equal(zarfDegerlendir(z, aday({ kalite: '7075' })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ kalite: '5083' })).sonuc, 'sartli');
  assert.deepEqual(zarfDegerlendir(z, aday({ kalite: '6061' })), { sonuc: 'disi', nedenler: ['Kalite 6061 sınır dışı'] });
});

test('yüzey listesi ve boy aralığı; kapalı zarf sınırdan önce gelir', () => {
  const z = zarfHesapla(kart, [], km, dm, [
    sinir('kart', '42', 'yuzey', { degerler: [{ deger: 'Soyulmuş', tur: 'tam' }] }), sinir('kart', '42', 'l', { alt: 2500, ust: 3500 }),
  ]);
  assert.equal(zarfDegerlendir(z, aday({ yuzey: 'Soyulmuş' })).sonuc, 'icinde');
  assert.equal(zarfDegerlendir(z, aday({ yuzey: 'Taşlanmış' })).sonuc, 'disi');
  assert.equal(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 2600 } })).sonuc, 'icinde');
  assert.deepEqual(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 4000 } })).nedenler, ['Boy uzun']);
  assert.deepEqual(zarfDegerlendir(z, aday({ olcu: { d: 50, l: 2400 } })).nedenler, ['Boy kısa']);
  const kapali = zarfHesapla(kart, [kural('kart', '42', { kapali: true, gerekce: 'Örnek' })], km, dm, [sinir('kart', '42', 'd', { ust: 55 })]);
  assert.equal(zarfDegerlendir(kapali, aday({ olcu: { d: 52, l: 3000 } })).sonuc, 'disi');
});

test('boruda et kalınlığına alt sınır verilirse atlanmaz', () => {
  const boru: ZarfKarti = { ...kart, form: 'boru', olcu: { D: 50, t: 5, l: 3000 } };
  const z = zarfHesapla(boru, [], km, dm, [sinir('kart', '42', 't', { alt: 6, ust: 8 })]);
  assert.deepEqual(zarfDegerlendir(z, aday({ form: 'boru', olcu: { D: 50, t: 5, l: 3000 } })), { sonuc: 'disi', nedenler: ['t 5 < 6'] });
  assert.equal(zarfDegerlendir(z, aday({ form: 'boru', olcu: { D: 52, t: 7, l: 3000 } })).sonuc, 'icinde');
});

test('sınır biçimi: liste niteliğine tekrarsız değer, ölçüye alt ya da üst', () => {
  assert.equal(sinirHatasi('kalite', [{ deger: 'A', tur: 'tam' }], null, null), null);
  assert.equal(sinirHatasi('kalite', null, null, null)?.alan, 'degerler');
  assert.equal(sinirHatasi('kalite', [{ deger: 'A', tur: 'tam' }, { deger: 'A', tur: 'ust' }], null, null)?.alan, 'degerler');
  assert.equal(sinirHatasi('d', null, null, null)?.alan, 'alt');
  assert.equal(sinirHatasi('d', null, 5, 4)?.alan, 'alt');
  assert.equal(sinirHatasi('d', [], 1, null)?.alan, 'alt');
  assert.equal(sinirHatasi('d', null, 4, null), null);
});
