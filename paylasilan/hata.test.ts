import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI, eskiSurumMu } from './hata.ts';
import type { HataGovdesi } from './hata.ts';

test('eskiSurumMu: yalnız eski sürüm çakışmasını tanır, öteki 409 ve ayrıntıları tanımaz', () => {
  const eski: HataGovdesi = { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } };
  assert.equal(eskiSurumMu(eski), true);

  const degil: HataGovdesi[] = [
    { kod: 'CAKISMA', mesaj: 'Bu kod kullanılıyor.' },
    { kod: 'CAKISMA', mesaj: 'x', ayrinti: null },
    { kod: 'CAKISMA', mesaj: 'x', ayrinti: 'eski-surum' },
    { kod: 'CAKISMA', mesaj: 'x', ayrinti: { neden: 'ayni-tanim', kartlar: [] } },
    { kod: 'ONAY_GEREKLI', mesaj: 'x', ayrinti: { neden: ESKI_SURUM_NEDENI } },
    { kod: 'BULUNAMADI', mesaj: 'x' },
  ];
  for (const govde of degil) assert.equal(eskiSurumMu(govde), false, JSON.stringify(govde));
});
