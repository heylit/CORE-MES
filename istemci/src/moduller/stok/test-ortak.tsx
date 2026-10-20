import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

// Stok yazan ama tanım ve geri alma yetkisi olmayan kişi (depo rolü kart #1225'ten beri tanım da taşır).
export const DEPOCU: Kullanici = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.toplama'] };
export const OKUYUCU: Kullanici = { id: 6, ad: 'Deneme Okuyucu', islemler: ['sayfa.stok'] };
export const MUDUR: Kullanici = { id: 7, ad: 'Deneme Müdür', islemler: ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama'] };

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
export interface Istek { yontem: string; yol: string; govde: unknown }

// Yol → cevap; bilinmeyen yol 404. Gelen istekler sırasıyla kaydedilir.
export function sunucuKur(kullanici: Kullanici, yollar: Record<string, (govde: unknown) => Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const isle = yollar[`${yontem} ${yol}`] ?? yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}
