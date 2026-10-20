import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ondalikMetinSemasi } from './ondalik.ts';

const gecer = (deger: unknown): boolean => ondalikMetinSemasi.safeParse(deger).success;

test('ondalık metin: tam, kesirli, eksi işaretli ve uzun değer kabul edilir, metin aynen kalır', () => {
  for (const deger of ['0', '7', '1.50', '-3', '-0.001', '0.000', '12345678901234567.891']) {
    assert.equal(ondalikMetinSemasi.parse(deger), deger);
  }
});

test('ondalık metin: sayı olmayan, üstel, virgüllü, eksik basamaklı ve boşluklu değer reddedilir', () => {
  const gecersizler = [
    '', ' ', 'abc', 'NaN', 'Infinity', '-Infinity', '1e5', '1E-3', '1,5', '1.2.3', '.5', '5.', '-', '+1', '--1',
    ' 1', '1 ', '1\n', '0x10', '1_000', '١٢',
  ];
  for (const deger of gecersizler) assert.equal(gecer(deger), false, JSON.stringify(deger));
});

test('ondalık metin: number ve null metin sayılmaz', () => {
  assert.equal(gecer('1.5'), true);
  assert.equal(gecer(1.5), false);
  assert.equal(gecer(null), false);
});
