import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAGIMLILIK_TABLOSU, DEVIR_YEDEK_ORAN, devirPartisi } from './devir-kurali.ts';

test('devirPartisi: devir adedi öncülün adedini aşamaz; boş ya da geçersiz devir adedi adedin dörtte biridir', () => {
  assert.equal(devirPartisi(3, 10), 3);
  assert.equal(devirPartisi(100, 90), 90);
  assert.equal(devirPartisi(null, 90), 23);
  assert.equal(devirPartisi(undefined, 8), 2);
  assert.equal(devirPartisi(0, 8), 2);
  assert.equal(devirPartisi(-4, 8), 2);
  assert.equal(devirPartisi(Number.NaN, 8), 2);
  assert.equal(devirPartisi(null, 2), 1);
  assert.equal(devirPartisi(5, 0), 0);
  assert.equal(devirPartisi(null, 8, 0.5), 4);
  assert.equal(DEVIR_YEDEK_ORAN, 0.25);
});

test('bağlantı türleri tablosu: her tür bir kez, yalnız bağımsız motorda bağ kurmaz', () => {
  assert.deepEqual(BAGIMLILIK_TABLOSU.map((t) => t.emir), ['akisli', 'bekleyen', 'bagimsiz']);
  assert.deepEqual(BAGIMLILIK_TABLOSU.map((t) => t.motor), ['o', 'b', null]);
});
