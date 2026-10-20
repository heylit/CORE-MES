import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tesisGunBasi, tesisGunu, tesisSaati } from './tesis-zamani.ts';

test('tesis saat dilimi: gün ve saat tesisin duvar saatidir, UTC değil', () => {
  assert.equal(tesisGunu(Date.parse('2026-10-10T20:59:59Z')), '2026-10-10');
  assert.equal(tesisGunu(Date.parse('2026-10-10T21:00:00Z')), '2026-10-11');
  assert.equal(tesisGunu(new Date('2026-12-31T22:30:00Z')), '2027-01-01');
  assert.equal(tesisSaati(Date.parse('2026-10-10T21:05:00Z')), '2026-10-11 00:05');
  assert.equal(tesisSaati(Date.parse('2026-10-10T20:59:30.9Z')), '2026-10-10 23:59');
});

test('tesis saat dilimi: günün başı tesisteki gece yarısıdır ve tesisGunu ile tutarlıdır', () => {
  assert.equal(new Date(tesisGunBasi('2026-10-11')).toISOString(), '2026-10-10T21:00:00.000Z');
  assert.equal(new Date(tesisGunBasi('2024-02-29')).toISOString(), '2024-02-28T21:00:00.000Z');
  // 2016 öncesi Türkiye yaz saati uyguluyordu: kışın fark +02:00'dir.
  assert.equal(new Date(tesisGunBasi('2015-01-15')).toISOString(), '2015-01-14T22:00:00.000Z');
  for (const tarih of ['2026-01-01', '2026-06-30', '2015-03-29', '2015-10-25']) {
    const bas = tesisGunBasi(tarih);
    assert.equal(tesisGunu(bas), tarih);
    assert.notEqual(tesisGunu(bas - 1), tarih);
  }
});
