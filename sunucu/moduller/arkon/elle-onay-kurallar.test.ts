import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cizimOnayiGecer, cizimSurumu, emirCizimDurumu, yayinDenetlenir } from './kurallar.ts';

// 2893-2 b: hazırlık maddesinin elle onayı Arkon kayıt kapısında yayın ve çizim kapısını açar (Atölye: sürüm değişince geçmez).
test('yayın kapısı: iş emrinde yayın elle onaylıysa taslak paket de başlar', () => {
  const run = { state: 'running', pkgId: 'tmi-ie-4' };
  assert.equal(yayinDenetlenir('events', run, 'bekliyor'), true);
  assert.equal(yayinDenetlenir('events', run, 'bekliyor', false), true);
  assert.equal(yayinDenetlenir('events', run, 'bekliyor', true), false);
});

test('çizim sürümü yayındaki revizyonlardır; onay paketin revizyonları onaylanan sürümdeyse geçer, sürümsüz onay hep geçer', () => {
  const yayinda = new Map<number, string | null>([[7, 'a'], [9, 'x']]);
  assert.equal(cizimSurumu([{ belgeId: 9 }, { belgeId: 7 }, { belgeId: 7 }], yayinda), '7@a,9@x');
  assert.equal(cizimSurumu([{ belgeId: 3 }], yayinda), '3@-', 'yayından kalkan çizim');
  assert.equal(cizimOnayiGecer('7@a,9@x', [{ belgeId: 7 }], yayinda), true, 'paket emrin çizimlerinden birini taşır');
  assert.equal(cizimOnayiGecer('7@a,9@x', [{ belgeId: 7 }], new Map([[7, 'b']])), false, 'onaydan sonra yeni revizyon yayınlandı');
  assert.equal(cizimOnayiGecer(null, [{ belgeId: 7 }], new Map([[7, 'b']])), true);
});

test('emrin çizim durumu sürümü taşır; çizimsiz emirde sürüm yok', () => {
  const dosya = { belgeId: 7, ozet: 'a', ad: 'Ç' };
  assert.deepEqual(emirCizimDurumu([], new Map()), { durum: 'yok', zaman: null, secildi: false });
  assert.deepEqual(emirCizimDurumu([{ dosyalar: [dosya], degisti: '2026-01-01T00:00:00.000Z' }], new Map([[7, 'b']])),
    { durum: 'suruyor', zaman: null, secildi: true, surum: '7@b' });
  assert.equal(emirCizimDurumu([{ dosyalar: [dosya], degisti: '2026-01-01T00:00:00.000Z' }], new Map([[7, 'a']])).surum, '7@a');
});
