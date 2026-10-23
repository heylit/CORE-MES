import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { today } from '#paylasilan/ik-motor/bicim.ts';
import { bugun } from './servis.ts';

// "Bugün" tesisin gününe göre sayılır (Europe/Istanbul); sunucunun saat dilimi sonuca karışmaz. UTC'de çalışan sunucuda
// gece 00:00-03:00 arası bir önceki gün sayılırdı.
const ESKI_TZ = process.env['TZ'];
beforeEach(() => {
  process.env['TZ'] = 'UTC';
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-17T22:30:00Z') });
});
afterEach(() => {
  mock.timers.reset();
  if (ESKI_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ESKI_TZ;
});

test('İK bugünü: UTC sunucuda İstanbul gece yarısından sonra yeni gündür', () => {
  assert.equal(bugun(), '2026-10-18');
  assert.equal(bugun(new Date('2026-10-18T20:59:00Z')), '2026-10-18');
});

test('İK motorunun bugünü de tesis günüdür', () => {
  const t = today() as Date;
  assert.deepEqual([t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours()], [2026, 10, 18, 0]);
});
