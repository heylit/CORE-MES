import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../../ortak/veri/api.ts';
import { DuzenleyenSeridi, useDuzenleyen } from './DuzenleyenSeridi.tsx';
import { SORMA_MS } from './kurallar.ts';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('DuzenleyenSeridi', () => {
  it('başkasının son yazmasını sorar ve aralıkla yeniler; okunamazsa gizli', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi.spyOn(api, 'get').mockResolvedValue({ kisiId: 7, kisi: 'Deneme B', zaman: new Date().toISOString(), surum: 12 } as never);
    const surum = () => 12;
    const { result } = renderHook(() => useDuzenleyen(3, surum));
    await waitFor(() => expect(result.current?.kisi).toBe('Deneme B'));
    expect(get).toHaveBeenCalledWith('/plan/planlama-calismasi/duzenleyen');
    get.mockRejectedValue(new Error('yok'));
    await act(async () => { await vi.advanceTimersByTimeAsync(SORMA_MS); });
    await waitFor(() => expect(result.current).toBeNull());
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('oturum yoksa sormaz', () => {
    const get = vi.spyOn(api, 'get');
    renderHook(() => useDuzenleyen(null, () => null));
    expect(get).not.toHaveBeenCalled();
  });

  it('sayfa eskiyse Yenile düğmesi çıkar', () => {
    const yenile = vi.fn();
    const { rerender } = render(<DuzenleyenSeridi d={{ kisi: 'Deneme B', zaman: Date.now(), eski: false }} yenile={yenile} />);
    expect(screen.getByRole('status').textContent).toMatch(/Deneme B bu planı düzenliyor/);
    expect(screen.queryByRole('button', { name: /Yenile/ })).toBeNull();
    rerender(<DuzenleyenSeridi d={{ kisi: 'Deneme B', zaman: Date.now(), eski: true }} yenile={yenile} />);
    fireEvent.click(screen.getByRole('button', { name: /Yenile/ }));
    expect(yenile).toHaveBeenCalledOnce();
  });
});
