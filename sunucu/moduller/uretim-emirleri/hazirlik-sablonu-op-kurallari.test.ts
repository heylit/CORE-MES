import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { gecerliKapaliMaddeler } from './hazirlik-sablonu-kurallari.ts';

// 3741: geçerli hâl önceliği OP farkı > emir farkı > tür şablonu; durduran madde emirde ve OP'de kapatılamaz.
describe('hazırlık şablonu: OP farkı önceliği (3741, saf kural)', () => {
  const durduran = new Set(['cnc', 'cizim']);
  const kapali = (s: string[], e: [string, boolean][], o: [string, boolean][]) =>
    [...gecerliKapaliMaddeler(new Set(s), e.map(([madde, gerekli]) => ({ madde, gerekli })), o.map(([madde, gerekli]) => ({ madde, gerekli })), durduran)].sort();

  test('fark yoksa tür şablonu aynen geçerlidir', () => {
    assert.deepEqual(kapali(['aparat'], [], []), ['aparat']);
  });
  test('emir farkı şablonu, OP farkı emir farkını geçer', () => {
    assert.deepEqual(kapali([], [['aparat', false]], []), ['aparat'], 'emir farkı kapatır');
    assert.deepEqual(kapali([], [['aparat', false]], [['aparat', true]]), [], 'OP farkı yeniden açar');
    assert.deepEqual(kapali(['aparat'], [['aparat', true]], [['aparat', false]]), ['aparat'], 'OP farkı yeniden kapatır');
    assert.deepEqual(kapali([], [], [['olcu-aleti', false]]), ['olcu-aleti'], 'yalnız OP farkı');
  });
  test('durduran madde emirde ve OP\'de kapatılamaz, açılabilir (3740: şablonda kapatılmış olsa da)', () => {
    assert.deepEqual(kapali([], [['cnc', false]], [['cizim', false]]), []);
    assert.deepEqual(kapali(['cnc'], [], [['cnc', true]]), [], 'OP farkı şablonun kapattığı durduranı açar');
    assert.deepEqual(kapali(['cnc'], [['cnc', true]], []), [], 'emir farkı da açar');
  });
  test('girdi kümeleri değişmez', () => {
    const sablon = new Set(['aparat']);
    gecerliKapaliMaddeler(sablon, [{ madde: 'aparat', gerekli: true }], [], durduran);
    assert.deepEqual([...sablon], ['aparat']);
  });
});
