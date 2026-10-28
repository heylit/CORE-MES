import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { ORNEK_AYAR, ORNEK_KARTLAR, ORNEK_SABLONLAR } from './ornek-veri.ts';
import { kartOnbelleginiBosalt } from './veri.ts';

const MALZEME: Islem[] = ['sayfa.malzemeler', 'malzemeler.yaz', 'malzemeler.onayla', 'malzemeler.tanim-yaz'];
export const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: [YENI_EKRAN_ISLEMI, ...MALZEME, 'satin-alma.oku', 'sayfa.etiket-merkezi'] };
export const YAZAN: Kullanici = { id: 7, ad: 'Deneme Yazan', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.malzemeler', 'malzemeler.yaz'] };
export const OKUYAN: Kullanici = { id: 9, ad: 'Deneme Okuyan', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.malzemeler'] };
export const KAPISIZ: Kullanici = { id: 11, ad: 'Deneme Kapısız', islemler: MALZEME };

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

export interface Istek { yontem: string; yol: string; govde: unknown }
export type Yanit = (govde: unknown, yol: string) => Response;

// Okumalar örnek veriyle hazırdır; yazmalar ve ek okumalar 'YONTEM /yol' anahtarıyla verilir (sorgusuz yol da eşleşir). Bilinmeyen yol 404.
export function sunucuKur(kullanici: Kullanici, yollar: Record<string, Yanit> = {}) {
  kartOnbelleginiBosalt();
  const istekler: Istek[] = [];
  const hazir: Record<string, Yanit> = {
    'GET /malzeme-katalogu-ayarlari': () => json(200, ORNEK_AYAR),
    'GET /malzeme-katalogu-kartlari': () => json(200, ORNEK_KARTLAR),
    'GET /malzeme-katalogu-sablonlari': () => json(200, ORNEK_SABLONLAR),
    'GET /stok/malzeme-kart-bilgileri': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 500 }),
    ...yollar,
  };
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde: unknown = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const isle = hazir[`${yontem} ${yol}`] ?? hazir[`${yontem} ${yol.split('?')[0] ?? yol}`];
    return isle ? isle(govde, yol) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function yeniIstemci(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Adres() { return <p data-testid="adres">{useLocation().pathname}</p>; }

// Modülün gerçek rota listesiyle açar.
export function yeniEkranAc(adres: string, istemci = yeniIstemci()) {
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Adres />
          <Routes>
            {rotalar.map((e) => <Route key={e.yol} path={e.yol} element={<e.ekran />} />)}
            <Route path="*" element={<p>Başka sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istemci;
}
