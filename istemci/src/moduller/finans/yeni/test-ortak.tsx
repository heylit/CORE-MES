import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import type { FinansHamVerisi } from './donustur.ts';
import { FinansYeni } from './FinansYeni.tsx';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { LISTELER } from './veri.ts';

// Yeni finans ekranı testlerinin ortak kurulumu (F1-F4 de kullanır). Kullanıcılar uydurmadır.
const kisi = (id: number, islemler: string[]): Kullanici => ({ id, ad: `Deneme ${id}`, islemler: islemler as Kullanici['islemler'] });
export const KAPI = 'kisiler.rol-yonet';
export const YAZAN = kisi(1, [KAPI, 'sayfa.finans', 'finans.oku', 'finans.yaz', 'musteri-tedarikci.oku']);
export const OKUYAN = kisi(2, [KAPI, 'sayfa.finans', 'finans.oku', 'musteri-tedarikci.oku']);
export const FIRMACI = kisi(3, [KAPI, 'sayfa.finans', 'musteri-tedarikci.oku']);
export const KAPISIZ = kisi(4, ['sayfa.finans', 'finans.oku', 'finans.yaz']);

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
export interface Istek { yontem: string; yol: string; govde: unknown }

// Finansın okuma uçları örnek veriyle cevaplanır; yazmalar `yazmalar` tablosundan (yoksa 404). İstekler sırasıyla kaydedilir.
export function sunucuKur(kullanici: Kullanici, yazmalar: Record<string, (govde: unknown) => Response> = {}, ham: FinansHamVerisi = ornekHamVeri()) {
  const istekler: Istek[] = [];
  const listeler = new Map<string, unknown[]>(Object.entries(LISTELER).map(([ad, yol]) => [yol, ham[ad as keyof typeof LISTELER] as unknown[]]));
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const tam = adres.replace('/api', '');
    const yol = tam.split('?')[0] ?? tam;
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET') {
      const satirlar = listeler.get(yol);
      if (satirlar) return json(200, { satirlar, toplam: satirlar.length, sayfaBoyu: 200 });
      if (yol === '/finans/ayar') return json(200, { ayar: ham.ayar });
      if (yol === '/finans/amortisman') return json(200, { aylar: ham.amortisman });
      if (yol === '/finans/kur-ozeti') return json(200, ham.kurOzeti);
      if (yol === '/finans/beklenen-odemeler') return json(200, { odemeler: ham.beklenenOdemeler });
      if (yol === '/satin-alma-ayarlari/sirket-adi') return json(200, { sirketAdi: ham.sirketAdi });
    }
    const isle = yazmalar[`${yontem} ${yol}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function finansAc(adres = '/finans/yeni') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            <Route path="/finans/yeni" element={<FinansYeni />} />
            <Route path="/finans/yeni/:bolum" element={<FinansYeni />} />
            <Route path="*" element={<p>Başka sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istemci;
}
