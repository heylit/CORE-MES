import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type * as Baglam from '../veri/baglam.ts';
import type { TmiAdim } from '../veri/depo.ts';
import { useTalimatlar } from './Talimatlar.tsx';

// 3614: önizleme talimat listesini okur ama işaret yazmaz. Veriler uydurmadır (ORN-).
const tmiAdimlari = vi.fn<(emirId: number) => Promise<TmiAdim[]>>();
const tmiAdimIsaretle = vi.fn<() => Promise<TmiAdim[]>>();
const BAGLAM = { depo: { Server: { tmiAdimlari, tmiAdimIsaretle } } };
const DURUM = { mode: 'server' };
vi.mock('../veri/baglam.ts', async (asil) => ({
  ...(await asil<typeof Baglam>()),
  useArkon: () => BAGLAM,
  useArkonDurumu: () => DURUM,
}));
const LISTE: TmiAdim[] = [{ id: 1, sira: 1, ad: 'ORN aparatı bağla', aciklama: null, tamam: false, asama: 'hazirlik', zorunlu: true }];

afterEach(() => { cleanup(); tmiAdimlari.mockReset(); tmiAdimIsaretle.mockReset(); });

describe('useTalimatlar önizleme (3614)', () => {
  it('önizlemede liste okunur, işaretleme istek göndermez', async () => {
    tmiAdimlari.mockResolvedValue(LISTE);
    const { result } = renderHook(() => useTalimatlar(7, true));
    await waitFor(() => { expect(result.current.liste).toEqual(LISTE); });
    act(() => { result.current.isaretle(1, true); });
    expect(tmiAdimlari).toHaveBeenCalledWith(7);
    expect(tmiAdimIsaretle).not.toHaveBeenCalled();
    expect(result.current.liste).toEqual(LISTE);
  });

  it('önizleme dışında işaretleme sunucuya gider', async () => {
    tmiAdimlari.mockResolvedValue(LISTE);
    tmiAdimIsaretle.mockResolvedValue([{ ...LISTE[0]!, tamam: true }]);
    const { result } = renderHook(() => useTalimatlar(7, false));
    await waitFor(() => { expect(result.current.liste).toEqual(LISTE); });
    act(() => { result.current.isaretle(1, true); });
    expect(tmiAdimIsaretle).toHaveBeenCalledTimes(1);
  });
});
