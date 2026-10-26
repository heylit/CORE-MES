import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { api } from '../../../../../ortak/veri/api.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { FARK_BEKLEME_MS, useCanliFarki } from './canli-farki.ts';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const CEVAP = { planSurumu: 3, ayni: false, guncel: true, tasinan: 1, tezgah: 1, sira: 0, yeni: 0, eksik: 0, isler: [], yazilamaz: [] };

describe('useCanliFarki', () => {
  it('açılışta hemen okur; çalışma değişince kayıt beklemesinden sonra bir kez yeniden okur; okunamazsa son bilinen kalır', async () => {
    vi.useFakeTimers();
    const get = vi.spyOn(api, 'get').mockResolvedValue(CEVAP as never);
    const c1 = {} as PlanlamaCalismasi;
    const { result, rerender } = renderHook(({ c }) => useCanliFarki(c, 3), { initialProps: { c: c1 } });
    expect(result.current).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toEqual({ var: true, say: 1, farkli: true });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValue({ ...CEVAP, ayni: true, tasinan: 0, tezgah: 0 } as never);
    rerender({ c: {} as PlanlamaCalismasi });
    rerender({ c: {} as PlanlamaCalismasi });
    await act(async () => { await vi.advanceTimersByTimeAsync(FARK_BEKLEME_MS - 1); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ var: true, say: 0, farkli: false });
    get.mockRejectedValue(new Error('yok'));
    rerender({ c: {} as PlanlamaCalismasi });
    await act(async () => { await vi.advanceTimersByTimeAsync(FARK_BEKLEME_MS); });
    expect(result.current).toEqual({ var: true, say: 0, farkli: false });
  });
});
