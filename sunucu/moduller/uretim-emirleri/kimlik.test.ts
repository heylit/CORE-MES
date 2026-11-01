import assert from 'node:assert/strict';
import { test } from 'node:test';
import { malzemeKimligi } from '../stok/disari.ts';
import { isEmriKimligi, uretimEmriKimligi, type IsEmriKimligi, type UretimEmriKimligi } from './disari.ts';

// 1580 (ADR 0025 kural 8): markalı kimlik çalışma anında aynı sayıdır; dönüştürücü geçersiz değeri reddeder.
test('kimlik dönüştürücü: geçerli tam sayı aynı değerle markalanır', () => {
  const emir: UretimEmriKimligi = uretimEmriKimligi(42);
  const is: IsEmriKimligi = isEmriKimligi(7);
  assert.equal(emir, 42);
  assert.equal(is, 7);
  assert.equal(malzemeKimligi(2147483647), 2147483647);
  // Markalı kimlik sayı bekleyen yere verilebilir: dönüş tipleri değişmeden pilot geriye uyumludur.
  const sayi: number = emir;
  assert.equal(sayi + 1, 43);
  // Pilotun amacı: bir kimlik türü ötekinin yerine geçmez (tip denetimi bu satır hata vermezse kırmızıdır).
  // @ts-expect-error iş emri kimliği üretim emri kimliği yerine verilemez
  const yanlis: UretimEmriKimligi = is;
  assert.equal(yanlis, 7);
});

test('kimlik dönüştürücü: sıfır, eksi, kesirli, 32 bit dışı ve sayı olmayan değer reddedilir', () => {
  for (const d of [0, -1, 1.5, 2147483648, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => uretimEmriKimligi(d), RangeError, String(d));
    assert.throws(() => isEmriKimligi(d), RangeError, String(d));
    assert.throws(() => malzemeKimligi(d), RangeError, String(d));
  }
});
