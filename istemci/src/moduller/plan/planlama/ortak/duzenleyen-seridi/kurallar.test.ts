import { describe, expect, it } from 'vitest';
import { DUZENLIYOR_DK, duzenleyen, duzenleyenMetni } from './kurallar.ts';

const SIMDI = Date.parse('2026-11-08T09:30:00Z');
const cevap = (o: Partial<{ kisiId: number | null; kisi: string | null; zaman: string | null; surum: number | null }> = {}) =>
  ({ kisiId: 7, kisi: 'Deneme B', zaman: '2026-11-08T09:25:00Z', surum: 12, ...o });

describe('duzenleyen', () => {
  it('başkası son dakikalarda yazdıysa gösterir; kendisi, kayıt yok ya da eski yazma gösterilmez', () => {
    expect(duzenleyen(cevap(), 3, 12, SIMDI)).toEqual({ kisi: 'Deneme B', zaman: Date.parse('2026-11-08T09:25:00Z'), eski: false });
    expect(duzenleyen(cevap(), 7, 12, SIMDI)).toBeNull();
    expect(duzenleyen(null, 3, 12, SIMDI)).toBeNull();
    expect(duzenleyen(cevap({ kisiId: null, kisi: null, zaman: null, surum: null }), 3, null, SIMDI)).toBeNull();
    expect(duzenleyen(cevap({ zaman: new Date(SIMDI - (DUZENLIYOR_DK * 60_000 + 1)).toISOString() }), 3, 12, SIMDI)).toBeNull();
  });

  it('sunucudaki sürüm sayfanınkinden farklıysa sayfa eskidir; ad okunamazsa genel ad', () => {
    expect(duzenleyen(cevap({ surum: 13 }), 3, 12, SIMDI)?.eski).toBe(true);
    expect(duzenleyen(cevap({ surum: 13 }), 3, null, SIMDI)?.eski).toBe(false);
    expect(duzenleyen(cevap({ kisi: null }), 3, 12, SIMDI)?.kisi).toBe('Başka bir kişi');
  });

  it('metin: haber ver; sayfa eskiyse yenile', () => {
    const d = duzenleyen(cevap(), 3, 12, SIMDI)!;
    expect(duzenleyenMetni(d)).toMatch(/^Şu an Deneme B bu planı düzenliyor \(son değişiklik \d\d:\d\d\)\. Canlıya almadan önce ona haber verin\.$/);
    expect(duzenleyenMetni({ ...d, eski: true })).toMatch(/Sayfanızdaki çalışma eski; yenilemeden yaptığınız değişiklik kaydedilmez\.$/);
  });
});
