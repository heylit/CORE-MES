import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { hareketAcik, useSayac } from './hareket.ts';

const kok = document.documentElement;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  kok.removeAttribute('data-hareket');
  kok.removeAttribute('data-etki-kapali');
});

function hareketliOrtam() {
  const kareler: FrameRequestCallback[] = [];
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => kareler.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const oynat = (an: number) => { act(() => { for (const f of kareler.splice(0)) f(an); }); };
  return oynat;
}

describe('grafik hareketi (karar 2081-7)', () => {
  it('olculemeyen ortamda, hareket kapaliyken ve kurum kapattiginda sayi ilk anda tam yazilir', () => {
    expect(renderHook(() => useSayac(42)).result.current).toBe(42);
    hareketliOrtam();
    expect(hareketAcik()).toBe(true);
    kok.setAttribute('data-hareket', 'kapali');
    expect(hareketAcik()).toBe(false);
    kok.removeAttribute('data-hareket');
    kok.setAttribute('data-etki-kapali', 'dalga grafik-hareket');
    expect(hareketAcik()).toBe(false);
    expect(renderHook(() => useSayac(42)).result.current).toBe(42);
  });

  it('sayac sifirdan sayar, bitiste tam degeri yazar; veri yoksa sayilmaz', () => {
    const oynat = hareketliOrtam();
    const { result, rerender } = renderHook(({ h }: { h: number | null }) => useSayac(h, 100), { initialProps: { h: 50 as number | null } });
    expect(result.current).toBe(0);
    oynat(0);
    oynat(50);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(50);
    oynat(100);
    expect(result.current).toBe(50);
    rerender({ h: null });
    expect(result.current).toBeNull();
  });
});
