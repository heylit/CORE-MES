import { describe, expect, it } from 'vitest';
import { BOS_ZAMAN, saatMetni, tarihMetni, tarihSaatMetni, zamanMetni } from './zaman-metni.ts';

// 2026-10-19T21:30Z tesiste (UTC+3) ertesi gün 00:30'dur: tarayıcının saat dilimi sonuca karışmaz.
const GECE = '2026-10-19T21:30:00Z';

describe('ortak zaman metni (tesis saati)', () => {
  it('an tesis saatiyle yazılır: gün.ay saat:dakika, saat:dakika, tam tarih ve saat', () => {
    expect(zamanMetni('2026-10-19T11:05:09Z')).toBe('19.10 14:05');
    expect(saatMetni('2026-10-19T11:05:09Z')).toBe('14:05');
    expect(tarihSaatMetni('2026-10-19T11:05:09Z')).toBe('19.10.2026 14:05');
    expect(tarihSaatMetni(GECE)).toBe('20.10.2026 00:30');
    expect(zamanMetni(GECE)).toBe('20.10 00:30');
  });

  it('tarih (date) saat dilimine çevrilmeden gün.ay.yıl yazılır', () => {
    expect(tarihMetni('2026-03-01')).toBe('01.03.2026');
  });

  it('boş değer tire, okunamayan değer olduğu gibi yazılır; sıfır uydurulmaz', () => {
    for (const f of [zamanMetni, saatMetni, tarihSaatMetni, tarihMetni]) {
      expect(f(null)).toBe(BOS_ZAMAN);
      expect(f('bilinmiyor')).toBe('bilinmiyor');
    }
    expect(BOS_ZAMAN).toBe('—');
  });
});
