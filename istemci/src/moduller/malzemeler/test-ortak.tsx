import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';

export const ACAN: Kullanici = { id: 7, ad: 'Deneme Açan', islemler: ['sayfa.malzemeler', 'malzemeler.yaz'] };
export const SORUMLU: Kullanici = { id: 8, ad: 'Deneme Sorumlu', islemler: ['sayfa.malzemeler', 'malzemeler.yaz', 'malzemeler.onayla', 'malzemeler.tanim-yaz'] };
export const OKUYUCU: Kullanici = { id: 9, ad: 'Deneme Okuyucu', islemler: ['sayfa.malzemeler'] };

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
    const anahtar = `${yontem} ${yol.split('?')[0]}`;
    const isle = yollar[anahtar] ?? yollar[`${yontem} ${yol}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function ac(ekranlar: { yol: string; ekran: ComponentType }[], adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            {ekranlar.map((e) => <Route key={e.yol} path={e.yol} element={<e.ekran />} />)}
            <Route path="*" element={<p>Başka sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istemci;
}
