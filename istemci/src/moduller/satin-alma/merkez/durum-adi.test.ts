import { describe, expect, it } from 'vitest';
import { stLabel } from './constants.ts';
import { DURUM } from '../talep/ortak.ts';

// Kullanıcı kararı (16.10.2026, "Satın almada"): satın almaya gitmiş talep iki ekranda da aynı adla görünür; durum değeri değişmez.
describe('Talep durumu adı', () => {
  it('satın almacı ile talep eden taslak durumunu aynı adla görür', () => {
    expect(stLabel('draft')).toBe('Satın almada');
    expect(DURUM.taslak.metin).toBe(stLabel('draft'));
  });
});
