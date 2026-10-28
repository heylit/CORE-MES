import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _ayEkle, _isoGun, _tarih } from './turler.ts';

describe('takvim tarihi metni', () => {
  // Hata yalnız UTC'nin ilerisindeki dilimde görünür; CI makinesi UTC'dir.
  const asil = process.env['TZ'];
  beforeAll(() => { process.env['TZ'] = 'Europe/Istanbul'; });
  afterAll(() => { if (asil === undefined) delete process.env['TZ']; else process.env['TZ'] = asil; });

  test('yerel gece yarısı tarihi kendi gününü verir (UTC gününe kaymaz)', () => {
    const t = _tarih('2026-03-01');
    expect(t).not.toBeNull();
    if (t === null) return;
    expect(t.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(_isoGun(t)).toBe('2026-03-01');
    expect(_isoGun(_ayEkle(t, 12))).toBe('2027-03-01');
  });
});
