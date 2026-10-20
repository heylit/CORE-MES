import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { cihazTercihiAnahtari, cihazTercihiOku, cihazTercihiYaz, cihazTercihleriniSifirla, useCihazTercihi } from './cihaz-tercihi.ts';

beforeEach(() => { localStorage.clear(); cihazTercihleriniSifirla(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('cihaz tercihi', () => {
  it('yazılmamış tercih kapalıdır; yazılan tarayıcıda saklanır', () => {
    expect(cihazTercihiOku('stok-depocu')).toBe(false);
    cihazTercihiYaz('stok-depocu', true);
    expect(localStorage.getItem(cihazTercihiAnahtari('stok-depocu'))).toBe('acik');
    cihazTercihleriniSifirla();
    expect(cihazTercihiOku('stok-depocu')).toBe(true);
  });

  it('bir yerde yazılan tercih aynı penceredeki kancaya hemen geçer; başka ad etkilenmez', () => {
    const okuyan = renderHook(() => useCihazTercihi('stok-depocu'));
    const baska = renderHook(() => useCihazTercihi('baska'));
    act(() => { cihazTercihiYaz('stok-depocu', true); });
    expect(okuyan.result.current[0]).toBe(true);
    expect(baska.result.current[0]).toBe(false);
    act(() => { okuyan.result.current[1](false); });
    expect(okuyan.result.current[0]).toBe(false);
  });

  it('depolama kapalıysa tercih bellekte kalır; adsız kanca her zaman kapalıdır', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('kapali'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('kapali'); });
    expect(cihazTercihiOku('stok-depocu')).toBe(false);
    cihazTercihiYaz('stok-depocu', true);
    expect(cihazTercihiOku('stok-depocu')).toBe(true);
    const adsiz = renderHook(() => useCihazTercihi(null));
    expect(adsiz.result.current[0]).toBe(false);
  });
});
