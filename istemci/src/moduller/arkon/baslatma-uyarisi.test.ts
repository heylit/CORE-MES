import { describe, expect, it } from 'vitest';
import { baslatmaUyarisi, uyariliBaslatmaIletisi } from '../../../../arkon/web/src/data/baslatma-uyarisi.ts';

// Karar 110 b: girdi istasyonda yokken terminalde iş durmaz, uyarıyla başlar; stok sonradan düzeltilir.
describe('başlatmadan önce girdi denetimi', () => {
  it('eksik girdi başlatmayı durdurmaz, uyarı metni döner', () => {
    expect(baslatmaUyarisi({ hazir: false, metin: 'Girdi istasyonda yok: HM-1.' })).toBe('Girdi istasyonda yok: HM-1.');
    expect(baslatmaUyarisi({ hazir: false })).toBe('Girdi istasyonda yok');
  });
  it('hazırsa, denetlenemediyse ya da cevap yoksa uyarı yok', () => {
    expect(baslatmaUyarisi({ hazir: true })).toBeNull();
    expect(baslatmaUyarisi(undefined)).toBeNull();
    expect(baslatmaUyarisi(null)).toBeNull();
  });
  it('başladı iletisine uyarı eklenir', () => {
    expect(uyariliBaslatmaIletisi('Üretim başladı', 'Girdi istasyonda yok: HM-1.')).toBe('Üretim başladı · Girdi istasyonda yok: HM-1.');
  });
});
