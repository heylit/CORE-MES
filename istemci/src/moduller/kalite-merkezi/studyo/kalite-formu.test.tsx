import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KmBalon, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { useKaliteFormu, type OlcumYazici } from './KaliteFormu.tsx';

// Kalite formu (798): ölçüm tek kayıttır, yazımı formu açan verir. Balon ve ölçüm değerleri uydurmadır.
afterEach(() => { vi.unstubAllGlobals(); });

const balon = (o: Partial<KmBalon>): KmBalon => ({
  id: 7, no: 3, nominal: 'Ø10', tolerans: '±0,1', alt: '9.9', ust: '10.1', alet: null, siklik: null, kritik: false, yontem: 'elle',
  olcuAletiGerekir: false, tur: null, sayfa: 1, x: 1, y: 1, yaziKutusu: null, surum: 1, ...o,
});
const RESIM: KmResim = {
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [balon({}), balon({ id: 8, no: 4, alt: null, ust: null })],
};
const OLCUM = { id: 1, balonId: 7, numuneId: null, deger: '10.02', nitel: null, uygun: true, kaynak: 'kalite', parcaSayisi: null, kisi: 'Deneme', zaman: '2026-10-26T07:00:00.000Z' };

function kur() {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    istekler.push(adres);
    return new Response(JSON.stringify({ olcumler: [OLCUM] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sar = ({ children }: { children: ReactNode }) => <QueryClientProvider client={istemci}><BildirimSaglayici>{children}</BildirimSaglayici></QueryClientProvider>;
  return { istekler, sar };
}

describe('Kalite formu', () => {
  it('emrin son ölçümünü gösterir; yeni ölçü formu açanın yazıcısına numuneyle gider ve kayıt yeniden okunur', async () => {
    const { istekler, sar } = kur();
    const yaz = vi.fn<OlcumYazici>(async () => ({}));
    const { result } = renderHook(() => useKaliteFormu({ resim: RESIM, uretimEmriId: 6, numuneId: 9, yaz, engel: () => null }), { wrapper: sar });
    await waitFor(() => { expect(result.current.gosterilen[3]).toMatchObject({ v: 10.02, ok: true }); });
    const okuma = istekler.length;
    act(() => { result.current.olcumlerYaz({ ...result.current.gosterilen, 3: { v: 10.05, ok: true, at: 2 }, 4: { v: 'Geçmez', ok: false, at: 2 } }); });
    expect(yaz).toHaveBeenCalledWith({ uretimEmriId: 6, numuneId: 9, olcumler: [{ balonId: 7, deger: '10.05' }, { balonId: 8, nitel: 'gecmez' }] });
    expect(result.current.gosterilen[3]).toMatchObject({ v: 10.05 });
    await waitFor(() => { expect(istekler.length).toBeGreaterThan(okuma); });
  });

  it('engel varsa yazılmaz (reddedilen); yazıcı reddederse gönderilen ölçü geri alınır', async () => {
    const { sar } = kur();
    const yaz = vi.fn<OlcumYazici>(async () => { throw new Error('ret'); });
    const { result, rerender } = renderHook(({ engel }: { engel: string | null }) => useKaliteFormu({ resim: RESIM, uretimEmriId: 6, yaz, engel: () => engel }), {
      wrapper: sar, initialProps: { engel: 'Ölçüm yazma yetkiniz yok.' as string | null },
    });
    await waitFor(() => { expect(result.current.gosterilen[3]).toBeTruthy(); });
    act(() => { result.current.olcumlerYaz({ 3: { v: 10.05, ok: true, at: 2 } }); });
    expect(yaz).not.toHaveBeenCalled();
    rerender({ engel: null });
    act(() => { result.current.olcumlerYaz({ 3: { v: 10.05, ok: true, at: 2 } }); });
    expect(yaz).toHaveBeenCalledTimes(1);
    await waitFor(() => { expect(result.current.gosterilen[3]).toMatchObject({ v: 10.02 }); });
  });
});
