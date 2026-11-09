import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SAAT_ADIMI_MS, useAn } from './saat.ts';

afterEach(() => { vi.useRealTimers(); });

describe('ekranın saati', () => {
  it('dakikada bir ilerler (2506 a: vardiya boyunca açık sayfada şimdi donmaz)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(Date.parse('2026-11-09T05:00:00Z'));
    const { result, unmount } = renderHook(() => useAn());
    expect(result.current).toBe(Date.parse('2026-11-09T05:00:00Z'));
    act(() => { vi.advanceTimersByTime(SAAT_ADIMI_MS * 90); });
    expect(result.current).toBe(Date.parse('2026-11-09T06:30:00Z'));
    unmount();
  });
});
