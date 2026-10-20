import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donemAnahtari, kalipHatasi, numaraDonemi, numaraKur } from './numara.ts';

test('kalıp: tek sayaç zorunlu; bilinmeyen alan, yılsız ay, küçük harf ve hanesiz sayaç reddedilir', () => {
  for (const iyi of ['MK-{SAYAC:6}', 'ST-{YYYY}-{SAYAC:3}', '{PARCA}-{YY}-{AA}-{SAYAC:3}', 'A/B_C.{SAYAC:1}', '{SAYAC:9}']) {
    assert.equal(kalipHatasi(iyi, ['PARCA']), null, iyi);
  }
  for (const kotu of [
    '', '   ', 'MK-{YYYY}', '{SAYAC:3}-{SAYAC:3}', '{SAYAC}', '{SAYAC:0}', '{SAYAC:10}', '{PROJE}-{SAYAC:3}', '{AA}-{SAYAC:3}',
    'mk-{SAYAC:3}', 'MK {SAYAC:3}', 'MK-{SAYAC:3', '{YY:2}-{SAYAC:3}', `${'A'.repeat(60)}{SAYAC:3}`,
  ]) {
    assert.notEqual(kalipHatasi(kotu, ['PARCA']), null, kotu);
  }
});

test('dönem: ay varsa aylık, yalnız yıl varsa yıllık, yoksa sıfırlanmaz', () => {
  assert.equal(numaraDonemi('{YY}-{AA}-{SAYAC:3}'), 'ay');
  assert.equal(numaraDonemi('ST-{YYYY}-{SAYAC:3}'), 'yil');
  assert.equal(numaraDonemi('MK-{SAYAC:6}'), 'hep');
  assert.equal(donemAnahtari('ay', 2026, 3), '2026-03');
  assert.equal(donemAnahtari('yil', 2026, 3), '2026');
  assert.equal(donemAnahtari('hep', 2026, 3), '-');
});

test('numara: alanlar doldurulur, sayaç haneye tamamlanır ve taşınca uzar; boş alan tiresiyle düşer', () => {
  const g = { yil: 2026, ay: 3, sira: 7 };
  assert.equal(numaraKur('ST-{YYYY}-{SAYAC:3}', g), 'ST-2026-007');
  assert.equal(numaraKur('{YY}{AA}{SAYAC:2}', g), '260307');
  assert.equal(numaraKur('M-{SAYAC:2}', { ...g, sira: 1234 }), 'M-1234');
  const kalip = '{FIRMA}-{PROJE}-{PARCA}-{YY}-{AA}-{SAYAC:3}';
  assert.equal(numaraKur(kalip, { ...g, alanlar: { FIRMA: 'FRM', PROJE: 'PRJ', PARCA: 'PRC' } }), 'FRM-PRJ-PRC-26-03-007');
  assert.equal(numaraKur(kalip, { ...g, alanlar: { FIRMA: null, PROJE: ' ', PARCA: 'PRC' } }), 'PRC-26-03-007');
  assert.equal(numaraKur(kalip, g), '26-03-007');
});
