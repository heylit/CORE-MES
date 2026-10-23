import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KmDeposu, siradakiNo, useKmKomutu } from './veri.ts';
import { MUAYENECI, sunucuKur, kayitYazmalari } from './test-ortak.tsx';

afterEach(() => { vi.unstubAllGlobals(); });

describe('KmDeposu', () => {
  it('yalnız daha yeni sürümü alır, silineni listeden düşürür, cihazı akıştan almaz', () => {
    const d = new KmDeposu();
    d.uygula({ surum: 3, degisiklikler: [
      { koleksiyon: 'ncr', kimlik: 'a', govde: { no: 'NCR-1' }, surum: 3 },
      { koleksiyon: 'dev', kimlik: 'x', govde: { ad: 'akıştan' }, surum: 2 },
    ] });
    d.hatirla('ncr', 'a', { govde: { no: 'eski' }, surum: 1 });
    expect(d.govde('ncr', 'a')).toEqual({ no: 'NCR-1' });
    expect(d.beklenen('ncr', 'a')).toBe(3);
    d.cihazlariKoy({ cihazlar: [{ kimlik: 'c1', govde: { ad: 'Kumpas' } }] });
    expect(d.goruntu('K').dev).toEqual([{ ad: 'Kumpas', _id: 'c1' }]);
    d.hatirla('ncr', 'a', { govde: null, surum: 4 });
    expect(d.beklenen('ncr', 'a')).toBeNull();
    expect(d.goruntu('K').ncr).toEqual([]);
  });
});

describe('siradakiNo', () => {
  it('yılın en büyüğüne bir ekler, başka yılı saymaz', () => {
    expect(siradakiNo([{ no: 'NCR-2026-0007' }, { no: 'NCR-2025-0099' }, { no: 'DOF-2026-0050' }], 'NCR', 2026)).toBe('NCR-2026-0008');
    expect(siradakiNo([], 'NCR', 2026)).toBe('NCR-2026-0001');
  });
});

function kanca() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sarmal = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useKmKomutu('Muayeneci'), { wrapper: sarmal });
}

describe('useKmKomutu.kaydet', () => {
  it('yeni kaydı beklenen sürüm null ile yazar ve oluşturma izi ekler', async () => {
    const { yazmalar } = sunucuKur(MUAYENECI);
    const { result } = kanca();
    await waitFor(() => expect(result.current).toBeTruthy());
    const { kimlik } = await result.current.kaydet('ncr', { no: 'NCR-2026-0001', durum: 'Açık' });
    const ncr = kayitYazmalari(yazmalar, 'ncr');
    expect(ncr).toHaveLength(1);
    expect(ncr[0]?.yol).toBe(`/kalite-merkezi/kayitlar/ncr/${kimlik}/yaz`);
    expect(ncr[0]?.govde).toMatchObject({ surum: null, govde: { no: 'NCR-2026-0001', durum: 'Açık' } });
    const iz = kayitYazmalari(yazmalar, 'iz');
    expect(iz[0]?.govde).toMatchObject({ govde: { islem: 'oluşturma', col: 'ncr', id: kimlik, rol: 'Muayeneci' } });
  });

  it('onay alanı reddedilince aynı gövdeyi onay ucuna gönderir', async () => {
    const { yazmalar, fetch } = sunucuKur(MUAYENECI);
    const asil = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (adres: string, istek?: RequestInit) => {
      if (adres.includes('/kayitlar/ncr/') && adres.endsWith('/yaz')) {
        await asil(adres, istek);
        return new Response(JSON.stringify({ kod: 'YETKI', mesaj: 'Onay gerekir.', alan: 'onay' }), { status: 403 });
      }
      return asil(adres, istek);
    });
    const { result } = kanca();
    await waitFor(() => expect(result.current).toBeTruthy());
    await result.current.kaydet('ncr', { _id: 'n1', durum: 'Kapalı' });
    const yollar = kayitYazmalari(yazmalar, 'ncr').map((y) => y.yol);
    expect(yollar).toEqual(['/kalite-merkezi/kayitlar/ncr/n1/yaz', '/kalite-merkezi/kayitlar/ncr/n1/onayla']);
  });
});
