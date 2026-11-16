import { describe, expect, it } from 'vitest';
import { bugun, teslimGunu, terminGunu } from './teslim-suresi.ts';

describe('teklif teslim süresi (3326)', () => {
  it('termin ile gün birbirinden hesaplanır; takvim günü', () => {
    expect(teslimGunu('2026-11-28', '2026-11-16')).toBe(12);
    expect(terminGunu(12, '2026-11-16')).toBe('2026-11-28');
    expect(terminGunu(20, '2026-12-20')).toBe('2027-01-09');
  });
  it('geçmiş, bugünkü ya da 365 günden uzak termin süre vermez', () => {
    expect(teslimGunu('2026-11-16', '2026-11-16')).toBeNull();
    expect(teslimGunu('2026-11-10', '2026-11-16')).toBeNull();
    expect(teslimGunu('2028-01-01', '2026-11-16')).toBeNull();
    expect(teslimGunu(null, '2026-11-16')).toBeNull();
  });
  it('bugün tesis günüdür (UTC+3)', () => {
    expect(bugun(Date.parse('2026-11-15T21:30:00Z'))).toBe('2026-11-16');
    expect(bugun(Date.parse('2026-11-15T20:30:00Z'))).toBe('2026-11-15');
  });
});
