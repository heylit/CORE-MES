import { vi } from 'vitest';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import type { TaslakYazici } from './taslak.ts';

// Taslak sahtedir: yazılan komutlar toplanır, değerlendirme sabit sonuç döner.
export function sahteTaslak(dataVer: number, ozet: Record<string, unknown> = { wT: 20, late: 0, n: 2 }) {
  const yazilan: TaslakKomutu[] = [];
  const t: TaslakYazici = {
    cevap: null, mesgul: false, diziliyor: false, hata: null,
    yaz: vi.fn((k: TaslakKomutu) => { yazilan.push(k); return Promise.resolve(true); }),
    diz: vi.fn(() => Promise.resolve(true)),
    dizIsler: vi.fn(() => Promise.resolve(true)),
    degerlendir: vi.fn(() => Promise.resolve({
      is: 'ORN-is', cevap: { calismaSurumu: 9, dataVer, baslangic: null, simdi: 0, maliyetGorunur: false, sonuc: { tur: 'plan-uygula' as const, plan: { ozet } } },
    })),
    dizmeyiYaz: vi.fn(() => Promise.resolve(true)), geriAl: vi.fn(() => Promise.resolve(true)), vazgec: vi.fn(() => Promise.resolve(true)),
    uygula: vi.fn(() => Promise.resolve(null)), yenile: vi.fn(),
  };
  return { t, yazilan };
}
