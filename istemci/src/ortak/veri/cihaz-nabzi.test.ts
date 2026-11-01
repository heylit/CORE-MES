import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NabizGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { ILK_NABIZ_MS, NABIZ_ARALIGI_MS, cihazNabziniBaslat } from './cihaz-nabzi.ts';

afterEach(() => { vi.useRealTimers(); });

const hataAt = () => { window.dispatchEvent(new ErrorEvent('error', { message: 'deneme' })); };

describe('cihaz nabzı (kart 1666, 1621 a)', () => {
  it('ilk nabız 30 sn sonra, sonra beş dakikada bir gider; kişi, konum ve saat göndermez', async () => {
    vi.useFakeTimers();
    const gonder = vi.fn(async (_g: NabizGovdesi) => ({ yazildi: true }));
    const durdur = cihazNabziniBaslat({ gonder });
    await vi.advanceTimersByTimeAsync(ILK_NABIZ_MS - 1);
    expect(gonder).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(gonder).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NABIZ_ARALIGI_MS);
    expect(gonder).toHaveBeenCalledTimes(2);
    expect(Object.keys(gonder.mock.calls[0]?.[0] ?? {}).sort()).toEqual(['jsHata', 'kuyruk', 'sonEsitlemeSn', 'surum']);
    durdur();
    await vi.advanceTimersByTimeAsync(NABIZ_ARALIGI_MS * 2);
    expect(gonder).toHaveBeenCalledTimes(2);
  });

  it('kuyruk kaynağı yoksa kuyruk ve eşitleme null gider, sıfır uydurulmaz; kaynak verilirse onunki gider', async () => {
    vi.useFakeTimers();
    const gonder = vi.fn(async (_g: NabizGovdesi) => ({ yazildi: true }));
    const durdur = cihazNabziniBaslat({ gonder });
    await vi.advanceTimersByTimeAsync(ILK_NABIZ_MS);
    expect(gonder.mock.calls[0]?.[0]).toMatchObject({ kuyruk: null, sonEsitlemeSn: null });
    durdur();
    const gonder2 = vi.fn(async (_g: NabizGovdesi) => ({ yazildi: true }));
    const durdur2 = cihazNabziniBaslat({ gonder: gonder2, kuyrukKaynagi: () => ({ kuyruk: 7, sonEsitlemeSn: 42 }) });
    await vi.advanceTimersByTimeAsync(ILK_NABIZ_MS);
    expect(gonder2.mock.calls[0]?.[0]).toMatchObject({ kuyruk: 7, sonEsitlemeSn: 42 });
    durdur2();
  });

  it('JS hataları sayılır; yazılan nabızdan sonra sayaç sıfırlanır, yazılmayan ya da gidemeyen nabzın hataları sonrakine eklenir', async () => {
    vi.useFakeTimers();
    const cevaplar: (() => Promise<{ yazildi: boolean }>)[] = [
      async () => ({ yazildi: true }),
      async () => { throw new TypeError('ag'); },
      async () => ({ yazildi: false }),
      async () => ({ yazildi: true }),
    ];
    const gonder = vi.fn(async (_g: NabizGovdesi) => (cevaplar.shift() ?? (async () => ({ yazildi: true })))());
    const durdur = cihazNabziniBaslat({ gonder });
    hataAt(); hataAt();
    await vi.advanceTimersByTimeAsync(ILK_NABIZ_MS);
    hataAt();
    await vi.advanceTimersByTimeAsync(NABIZ_ARALIGI_MS);
    window.dispatchEvent(new Event('unhandledrejection'));
    await vi.advanceTimersByTimeAsync(NABIZ_ARALIGI_MS);
    await vi.advanceTimersByTimeAsync(NABIZ_ARALIGI_MS);
    expect(gonder.mock.calls.map((c) => c[0].jsHata)).toEqual([2, 1, 2, 2]);
    durdur();
  });
});
