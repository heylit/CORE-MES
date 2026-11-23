import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alternatifOzeti, type OzetAnaKarti, type OzetNiteligi } from './malzeme-alternatif-ozeti.ts';

// 3593: özet cümlesi (ORN- örnek: 6082 T6 Ø40 boy 3000, işlemsiz).
const ana: OzetAnaKarti = { form: 'cubuk', kalite: 'EN AW-6082', durum: 'T6', yuzey: null, standartlar: ['EN 754-2'], islemler: [], olcu: { d: 40, l: 3000 } };
const n = (nitelik: string, ek: Partial<OzetNiteligi>): OzetNiteligi => ({ nitelik, kip: null, degerler: null, alt: null, ust: null, payAlt: null, payUst: null, ...ek });

test('özet: liste, birebir, pay, aralık; serbest yazılmaz, işlem satırı yoksa "işlem serbest"', () => {
  assert.deepEqual(alternatifOzeti([
    n('kalite', { degerler: ['EN AW-6082', 'EN AW-6061'] }), n('durum', { kip: 'birebir' }), n('islem', { kip: 'birebir' }),
    n('d', { kip: 'pay', payAlt: 0, payUst: 5 }), n('l', { kip: 'birebir' }),
  ], ana), ['EN AW-6082 ya da EN AW-6061', 'T6', 'işlem yok', 'Ø 40–45 (−0/+5)', 'boy birebir 3.000']);
  assert.deepEqual(alternatifOzeti([n('d', { alt: 40, ust: 50 }), n('l', { kip: 'aralik', alt: 2500 })], ana), ['işlem serbest', 'Ø 40–50', 'boy en az 2.500']);
  assert.deepEqual(alternatifOzeti([n('islem', { degerler: ['T6', 'eloksal'] }), n('yuzey', { kip: 'birebir' }), n('standart', { kip: 'birebir' })], ana),
    ['işlem T6 + eloksal', 'yüzey yok', 'std EN 754-2']);
  assert.deepEqual(alternatifOzeti([n('form', { degerler: ['cubuk'] }), n('d', { kip: 'pay', payAlt: 1, payUst: 2 })], null, (f) => f.toUpperCase()),
    ['CUBUK', 'işlem serbest', 'Ø (−1/+2)']);
});
