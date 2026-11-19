import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KAPSAM_DOGRULAMA, uyanKurallar, zarfaGirenler, zarfDegerlendir, zarfHesapla, type KuralSatiri, type ZarfKarti } from './alternatif/kurallar.ts';
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
  assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 50, enCok: 57.5 }]);
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
  assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 10, enCok: 13 }]);
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
