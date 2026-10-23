import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KurumCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, SorguCevabi } from '#paylasilan/sozlesme/portal.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { rotalar } from '../rotalar.tsx';
import type { Depo } from './tipler.ts';

// Yeni ekran testlerinin sahte sunucusu ve açıcısı. Kişi adları uydurmadır.

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

export interface Istek { yontem: string; yol: string; govde: unknown }

export function sunucuKur(kullanici: Kullanici, depo: Depo, ek?: (yontem: string, yol: string, govde: unknown) => Response | null): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde: unknown = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : null;
    istekler.push({ yontem, yol, govde });
    const ozel = ek?.(yontem, yol, govde);
    if (ozel) return ozel;
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/kurum') return json(200, { ad: 'Deneme Atölye' } satisfies KurumCevabi);
    if (yontem === 'GET' && yol === '/portal/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: true, yonetici: false, kurulumGerekli: false, portalKullanicisi: true } satisfies BenCevabi);
    }
    if (yontem === 'POST' && yol === '/portal/ben/hazirla') return json(200, { kuruldu: false });
    if (yontem === 'GET' && yol === '/portal/damga') return json(200, { damga: 1 });
    if (yontem === 'GET' && yol.startsWith('/portal/sorgu')) {
      const ad = new URLSearchParams(yol.split('?')[1] ?? '').get('koleksiyon') ?? '';
      const kayitlar = Object.values((depo as unknown as Record<string, Record<string, { id: string; surum: number }>>)[ad] ?? {});
      const belgeler = kayitlar.map(({ id, surum, ...veri }) => ({ yol: `${ad}/${id}`, kimlik: id, veri, surum }));
      return json(200, { belgeler, damga: 1 } satisfies SorguCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}
