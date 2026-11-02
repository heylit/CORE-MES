import { describe, expect, it } from 'vitest';
import { maliyetBaglami } from './kurallar.ts';
import { maliyetIsisi } from './Maliyetler.tsx';
import { ornekCalisma } from './test-verisi.ts';

// 1786c (PLN-6): saat maliyeti bilinmeyen tezgâhta çalışan siparişin tezgâh ve ayar kalemi 0 TL değil, eksik (?) görünür (kural 5).
describe('maliyet ısısı', () => {
  it('tezgâh ücreti bilinmeyen siparişte tezgâh ve ayar hücresi eksik, sıfır değil', () => {
    const c = ornekCalisma({ D: { tezgahlar: [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: null, verim: 1 }] } });
    const b = maliyetBaglami(c);
    if (!b) throw new Error('bağlam yok');
    const v = maliyetIsisi(b);
    if (!('satirlar' in v)) throw new Error('ısı yok');
    const h = v.satirlar[0]?.h ?? {};
    expect(h.isl).toMatchObject({ sm: 'alert', v: '?', etiket: 'Tezgâh: tezgâh saat maliyeti eksik' });
    expect(h.ayar).toMatchObject({ sm: 'alert', v: '?' });
    expect(v.ust.metin).not.toMatch(/tezgâh: 0 TL/);
  });

  it('ücret biliniyorsa tezgâh hücresi tutarı gösterir', () => {
    const b = maliyetBaglami(ornekCalisma());
    if (!b) throw new Error('bağlam yok');
    const v = maliyetIsisi(b);
    if (!('satirlar' in v)) throw new Error('ısı yok');
    expect(v.satirlar[0]?.h.isl?.v).toBe('190');
  });
});
