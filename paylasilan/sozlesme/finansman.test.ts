import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aylikFaizdenGunluk, aylikFaizdenYillik, finansmanTutari, gunlukFaizdenAylik, vadeIndirimCarpani } from './finansman.ts';

const yakin = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('1383 a: aylık oran yıllığa x 12, günlüğe x 12 / 365 çevrilir (basit faiz)', () => {
  yakin(aylikFaizdenYillik(4), 48);
  yakin(aylikFaizdenGunluk(4), 48 / 365);
  yakin(gunlukFaizdenAylik(aylikFaizdenGunluk(3.65)), 3.65, 1e-4);
});

test('1383 a: finansman tutarı = tutar x günlük oran x gün; aylık %4 ile 90 gün %11,84', () => {
  yakin(finansmanTutari(100, aylikFaizdenGunluk(4), 90), 11.835616438, 1e-6);
  assert.equal(finansmanTutari(100, aylikFaizdenGunluk(4), 0), 0);
});

test('1383 a: vade indirim çarpanı basit faizle 1 / (1 + oran x gün); eksi gün sıfır sayılır', () => {
  yakin(vadeIndirimCarpani(4, 90), 1 / (1 + (48 / 365 / 100) * 90));
  assert.equal(vadeIndirimCarpani(4, 0), 1);
  assert.equal(vadeIndirimCarpani(4, -5), 1);
  assert.equal(vadeIndirimCarpani(0, 90), 1);
});
