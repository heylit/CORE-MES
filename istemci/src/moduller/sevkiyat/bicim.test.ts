import { describe, expect, it } from 'vitest';
import { gunAdi } from './bicim.ts';

describe('gunAdi (uyarılar seçili güne göre yazılır)', () => {
  const simdi = new Date(2026, 9, 11, 10, 0);
  it('bugün, yarın ve dün adıyla; başka gün tarihiyle', () => {
    expect(gunAdi('2026-10-11', simdi)).toBe('bugün');
    expect(gunAdi('2026-10-12', simdi)).toBe('yarın');
    expect(gunAdi('2026-10-10', simdi)).toBe('dün');
    expect(gunAdi('2026-10-15', simdi)).toBe('15.10.2026 günü');
  });
});
