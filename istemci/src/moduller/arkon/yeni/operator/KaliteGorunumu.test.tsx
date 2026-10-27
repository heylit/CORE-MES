import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ArkonBaglamiKaynagi, type ArkonBaglami } from '../veri/baglam.ts';
import { KaliteGorunumu } from './KaliteGorunumu.tsx';
import type { Is } from './tipler.ts';

// 600 a: kalite istasyonu terminalinin numune ve lot kararı. Değerler uydurmadır; karar sunucuda Kalite Merkezi'ne yazılır (sunucu testleri).

afterEach(cleanup);

const numune = (id: string, ek: Record<string, unknown> = {}) => ({
  id, pkgId: 'tmi-ie-1', no: 'IE-1', part: 'Deneme', rev: 'A', machine: 'TOR', by: 'op', at: 1, reason: 'İlk parça', items: [1], crit: false, cnt: 1,
  status: 'waiting', results: {}, kaliteIstasyonu: 'KAL', ...ek,
});
const is = (ek: Partial<Is> = {}): Is => ({
  no: 'IE-2', part: 'Deneme', op: 'Op 20', due: '—', target: 40, cycle: 0, state: 'running', good: 0, scrap: 0, meas: {}, pins: [],
  pkg: { id: 'tmi-ie-2', tmi: { aql: { n: 13, ac: 1, re: 2 } } }, ...ek,
} as unknown as Is);

function kur(g: { istekler?: unknown[]; sonuc?: unknown; izinli?: boolean; o?: Is } = {}) {
  const put = vi.fn(async () => {});
  const send = vi.fn();
  const depo = {
    DB: { all: vi.fn(async () => g.istekler ?? []), get: vi.fn(async () => g.sonuc), put },
    Bus: { on: () => () => {}, send },
  };
  const baglam = { depo, kisi: { name: 'Kalite K' } } as unknown as ArkonBaglami;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sar = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={istemci}><MemoryRouter><ArkonBaglamiKaynagi.Provider value={baglam}>{children}</ArkonBaglamiKaynagi.Provider></MemoryRouter></QueryClientProvider>
  );
  const olc = vi.fn();
  render(<KaliteGorunumu istasyon="KAL" is={g.o ?? is()} izinli={g.izinli ?? true} olc={olc} soyle={() => {}} />, { wrapper: sar });
  return { put, send, olc };
}

describe('600 a: kalite istasyonu görünümü', () => {
  it('yalnız bu istasyona gelen numuneyi listeler; Kabul isteği onaylar, Ölç Kalite sayfasını açar', async () => {
    const { put, send, olc } = kur({ istekler: [numune('n1'), numune('n2', { kaliteIstasyonu: 'BASKA' })] });
    expect(await screen.findByText('1 numune bekliyor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ölç/ }));
    expect(olc).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: /^Kabul$/ })[0]!);
    await waitFor(() => expect(put).toHaveBeenCalledWith('requests', expect.objectContaining({ id: 'n1', status: 'approved', decidedBy: 'Kalite K' })));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'sample-result', reqId: 'n1', status: 'approved' }));
  });

  // 789-2a, 798: ilk parça numunesinin kararı yalnız Kalite Merkezi'nde; ölçü sayısı Kalite Merkezi kaydından (sunucu yazar).
  it('ilk parça numunesinde Kabul/Red yok, kararın Kalite Merkezi\'nde olduğu yazar; Ölç yerinde (reddedilen)', async () => {
    const { put } = kur({ istekler: [numune('n1', { ilkParca: true, kmOlculen: 2 })] });
    expect(await screen.findByText(/2 ölçü/)).toBeTruthy();
    const gelen = screen.getByRole('region', { name: 'Gelen numuneler' });
    expect(within(gelen).getByRole('note').textContent).toContain('İlk parça kararı Kalite Merkezi\'nde');
    expect(within(gelen).queryByRole('button', { name: /^(Kabul|Red)$/ })).toBeNull();
    expect(within(gelen).getByRole('button', { name: /Ölç/ })).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it('periyodik numunenin Red ölçüsü Kalite Merkezi kaydındaki sayıdan okunur', async () => {
    const { put } = kur({ istekler: [numune('n1', { reason: 'Her 10 parça', kmOlculen: 1 })] });
    await screen.findByText('1 numune bekliyor');
    fireEvent.click(within(screen.getByRole('region', { name: 'Gelen numuneler' })).getByRole('button', { name: /^Red$/ }));
    fireEvent.change(screen.getByLabelText('Red gerekçesi'), { target: { value: 'çap büyük' } });
    fireEvent.click(screen.getByRole('button', { name: /Reddet/ }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('requests', expect.objectContaining({ status: 'rejected', note: 'çap büyük' })));
  });

  it('numune Red ölçü ve gerekçe ister', async () => {
    kur({ istekler: [numune('n1')] });
    await screen.findByText('1 numune bekliyor');
    fireEvent.click(screen.getAllByRole('button', { name: /^Red$/ })[0]!);
    expect((screen.getByRole('button', { name: /Reddet/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const { put } = kur({ istekler: [numune('n1', { results: { 1: { ok: false, v: 2 } } })] });
    await screen.findByText('1 numune bekliyor');
    fireEvent.click(screen.getAllByRole('button', { name: /^Red$/ })[0]!);
    fireEvent.change(screen.getByLabelText('Red gerekçesi'), { target: { value: 'çap büyük' } });
    fireEvent.click(screen.getByRole('button', { name: /Reddet/ }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('requests', expect.objectContaining({ status: 'rejected', note: 'çap büyük' })));
  });

  it('lot kartı AQL planını gösterir; Red kusur ve gerekçe ister; karar sonuç belgesine yazılır', async () => {
    const { put } = kur({ istekler: [], sonuc: { id: 'tmi-ie-2', meas: {}, pins: [] } });
    expect(await screen.findByText(/numune 13 parça, kabul \(Ac\) 1, red \(Re\) 2/)).toBeTruthy();
    const lotDugmesi = (ad: string) => screen.getAllByRole('button', { name: new RegExp(`^${ad}$`) }).at(-1) as HTMLButtonElement;
    expect(lotDugmesi('Kabul').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Bulunan Majör kusurlu'), { target: { value: '2' } });
    expect(lotDugmesi('Red').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Lot kararı gerekçesi'), { target: { value: 'çapak' } });
    fireEvent.click(lotDugmesi('Red'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('results', expect.objectContaining({
      id: 'tmi-ie-2', lotKarari: expect.objectContaining({ karar: 'ret', bulunan: { Kritik: null, Majör: 2, Minör: null }, not: 'çapak' }),
    })));
  });

  it('verilmiş lot kararı yalnız gösterilir; yetkisiz rol karar veremez', async () => {
    kur({ sonuc: { id: 'tmi-ie-2', lotKarari: { karar: 'kabul', bulunan: { Kritik: 0, Majör: 0, Minör: null }, at: 1, by: 'K', kayit: { no: 'LOT-2026-1', karar: 'Kabul' } } } });
    expect(await screen.findByText(/Lot kabul edildi · LOT-2026-1/)).toBeTruthy();
    expect(screen.queryByLabelText('Bulunan Majör kusurlu')).toBeNull();
    cleanup();
    kur({ izinli: false, istekler: [numune('n1')] });
    expect(await screen.findByText('Bu rol lot kararı veremez')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Kabul$/ })).toBeNull();
  });
});
