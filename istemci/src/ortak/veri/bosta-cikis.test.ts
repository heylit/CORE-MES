import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ISTASYON_BOSTA_MS, useBostaCikis } from './bosta-cikis.ts';

afterEach(() => { vi.useRealTimers(); });

describe('istasyonda boşta çıkış (1356 a)', () => {
  it('15 dk dokunulmazsa bir kez çıkar; dokunuş sayacı baştan başlatır', () => {
    vi.useFakeTimers();
    const cikis = vi.fn();
    renderHook(() => { useBostaCikis(true, cikis); });
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS - 1000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS - 1000);
    expect(cikis).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS);
    expect(cikis).toHaveBeenCalledTimes(1);
  });

  it('fare kıpırtısı oturumu açık tutmaz', () => {
    vi.useFakeTimers();
    const cikis = vi.fn();
    renderHook(() => { useBostaCikis(true, cikis); });
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS - 1000);
    window.dispatchEvent(new Event('pointermove'));
    vi.advanceTimersByTime(1000);
    expect(cikis).toHaveBeenCalledTimes(1);
  });

  it('istasyon dışında ve kaldırılınca hiç çıkmaz', () => {
    vi.useFakeTimers();
    const cikis = vi.fn();
    renderHook(() => { useBostaCikis(false, cikis); });
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS * 2);
    const { unmount } = renderHook(() => { useBostaCikis(true, cikis); });
    unmount();
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS * 2);
    expect(cikis).not.toHaveBeenCalled();
  });

  it('çıkış işlevi değişince sayaç baştan başlamaz, son işlev çağrılır', () => {
    vi.useFakeTimers();
    const ilk = vi.fn();
    const son = vi.fn();
    const { rerender } = renderHook(({ c }) => { useBostaCikis(true, c); }, { initialProps: { c: ilk } });
    vi.advanceTimersByTime(ISTASYON_BOSTA_MS - 1000);
    rerender({ c: son });
    vi.advanceTimersByTime(1000);
    expect(ilk).not.toHaveBeenCalled();
    expect(son).toHaveBeenCalledTimes(1);
  });
});
