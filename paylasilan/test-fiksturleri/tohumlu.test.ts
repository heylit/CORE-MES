import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DegismezHatasi, TOHUM_DEGISKENI, VARSAYILAN_TUR, tohumOku, turlarlaSina, uretec } from './tohumlu.ts';

test('üreteç: aynı tohum aynı diziyi, başka tohum başka diziyi verir; aralık dışına çıkmaz', () => {
  const dizi = (t: number) => Array.from({ length: 20 }, ((u) => () => u.oran())(uretec(t)));
  assert.deepEqual(dizi(7), dizi(7));
  assert.notDeepEqual(dizi(7), dizi(8));
  const u = uretec(1);
  for (let i = 0; i < 1000; i += 1) {
    const x = u.tamSayi(-3, 3);
    assert.ok(Number.isInteger(x) && x >= -3 && x <= 3);
    const o = u.oran();
    assert.ok(o >= 0 && o < 1);
  }
  assert.throws(() => u.tamSayi(2, 1), RangeError);
  assert.throws(() => u.sec([]), RangeError);
});

test('turlar: varsayılan tur sayısı koşar; her tur ayrı tohum alır', () => {
  const gorulen = new Set<number>();
  assert.equal(turlarlaSina('sayim', {}, (_u, t) => { gorulen.add(t); }), VARSAYILAN_TUR);
  assert.equal(gorulen.size, VARSAYILAN_TUR);
  assert.equal(turlarlaSina('kısa', { tur: 3, taban: 100 }, () => undefined), 3);
});

test('turlar: bozulan tur tohumunu iletiyle verir; o tohumla tek tur aynı hatayı yeniden üretir', () => {
  const sina = (u: ReturnType<typeof uretec>) => { assert.ok(u.tamSayi(0, 9) !== 0, 'sıfır çıktı'); };
  const hata = (() => {
    try { turlarlaSina('sıfır yok', { tur: 500 }, sina); } catch (h) { return h; }
    return null;
  })();
  assert.ok(hata instanceof DegismezHatasi);
  assert.match(hata.message, new RegExp(`${TOHUM_DEGISKENI}=${String(hata.tohum)}`));
  assert.throws(() => turlarlaSina('sıfır yok', { tohum: hata.tohum }, sina), (h: unknown) => h instanceof DegismezHatasi && h.tohum === hata.tohum);
});

test('tohum okuma: boş tanımsız, tam sayı kabul, biçimsiz değer açık hata', () => {
  assert.equal(tohumOku(undefined), undefined);
  assert.equal(tohumOku(' '), undefined);
  assert.equal(tohumOku('42'), 42);
  for (const d of ['-1', '1.5', 'abc', '99999999999999999999']) assert.throws(() => tohumOku(d), RangeError, d);
});
