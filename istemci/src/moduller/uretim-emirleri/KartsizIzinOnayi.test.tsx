import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { KartsizIzin } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { api } from '../../ortak/veri/api.ts';
import * as oturum from '../../ortak/veri/oturum.ts';
import { KartsizIzinOnayi } from './KartsizIzinOnayi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ISTEK: KartsizIzin = {
  id: 31, durum: 'bekliyor', emir: { id: 5, no: 'ORN-UE-5' }, adim: { id: 41, sira: 1, ad: 'Tornalama' }, isteyen: { id: 9, ad: 'Ornek Operator' },
  istekAn: '2026-11-27T08:00:00+03:00', kararVeren: null, kararGerekce: null, kararAn: null, gecerlilikBitis: '2026-11-27T08:10:00+03:00',
};

function ac(islemler: string[]) {
  vi.spyOn(oturum, 'useOturum').mockReturnValue({ data: { islemler } } as never);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={['/adim-durumu/kartsiz-izin/31']}>
        <Routes><Route path="/adim-durumu/kartsiz-izin/:id" element={<KartsizIzinOnayi />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('3771 a: yetkili telefondan kartsız başlatma izni verir', () => {
  it('istek bilgisi görünür; gerekçe yazılmadan karar verilmez; izin verilince sonuç görünür', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ISTEK as never);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ...ISTEK, durum: 'izin', kararVeren: 'Ornek Mudur', kararGerekce: 'Kart basılmadı', kararAn: '2026-11-27T08:02:00+03:00' } as never);
    ac(['uretim-emirleri.kartsiz-baslat']);
    expect(await screen.findByText('Ornek Operator')).toBeTruthy();
    expect(screen.getByText('ORN-UE-5 · Op 1 Tornalama')).toBeTruthy();
    const izinVer = screen.getByRole('button', { name: /İzin ver/ }) as HTMLButtonElement;
    expect(izinVer.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Gerekçe/), { target: { value: 'Kart basılmadı' } });
    fireEvent.click(izinVer);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/uretim-emirleri/kartsiz-izinler/31/karar', { sonuc: 'izin', gerekce: 'Kart basılmadı' }));
    expect(await screen.findByText('İzin verildi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /İzin ver/ })).toBeNull();
  });

  it('Reddet ret kararını gerekçeyle gönderir', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ISTEK as never);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ...ISTEK, durum: 'ret', kararVeren: 'Ornek Mudur', kararGerekce: 'Kartı bulun', kararAn: '2026-11-27T08:02:00+03:00' } as never);
    ac(['uretim-emirleri.kartsiz-baslat']);
    fireEvent.change(await screen.findByLabelText(/Gerekçe/), { target: { value: 'Kartı bulun' } });
    fireEvent.click(screen.getByRole('button', { name: /Reddet/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/uretim-emirleri/kartsiz-izinler/31/karar', { sonuc: 'ret', gerekce: 'Kartı bulun' }));
    expect(await screen.findByText('Reddedildi')).toBeTruthy();
  });

  it('izin yetkisi olmayan karar düğmesini görmez', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ISTEK as never);
    ac(['terminal.uret']);
    expect(await screen.findByText('İzni kartsız başlatma yetkisi olan kişi verir.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reddet/ })).toBeNull();
  });
});
