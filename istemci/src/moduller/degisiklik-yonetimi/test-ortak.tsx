import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

export const YONETICI: Kullanici = {
  id: 1, ad: 'Deneme Yönetici',
  islemler: ['degisiklik-yonetimi.talep-ac', 'degisiklik-yonetimi.siniflandir', 'degisiklik-yonetimi.ccb-karar',
    'degisiklik-yonetimi.musteri-onayi', 'degisiklik-yonetimi.emir-ac'],
};
export const OKUR: Kullanici = { id: 2, ad: 'Deneme Okur', islemler: [] };

export interface Cagri { yontem: string; yol: string; govde: unknown }
type Yanit = (yol: string, yontem: string, govde: unknown) => Response | undefined;

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Uç tablosu yanıt vermezse 404 döner; çağrılar sırasıyla kaydedilir.
export function sunucuKur(kullanici: Kullanici, yanit: Yanit): Cagri[] {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde: unknown = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    return yanit(yol, yontem, govde) ?? json(404, { kod: 'BULUNAMADI', mesaj: yol });
  }));
  return cagrilar;
}

function Adres() {
  const k = useLocation();
  return <output data-testid="dy-adres" hidden>{`${k.pathname}${k.search}`}</output>;
}
export const adres = (): string => screen.getByTestId('dy-adres').textContent ?? '';

export function ac(yol: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[yol]}>
          <Adres />
          <Routes>
            {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const ZAMAN = '2026-10-20T07:30:00Z';
export const talep = (ek: Partial<TalepCevabi> = {}): TalepCevabi => ({
  id: 7, no: 'ECR-0007', baslik: 'Delik pahı eklenmesi', aciklama: 'Pah eksik.', onSinif: 'P1', sinif: null, aciliyet: 'normal',
  durum: 'gonderildi',
  malzemeler: [{ malzemeId: 11, kod: 'DNM-11', ad: 'Deneme flanş', cizimRevizyonu: 'B', tasarimOtoritesi: 'musteri', sozlesmeKonfigurasyonu: true, kullanimYeri: [] }],
  cevaplar: null, etki: null, musteriReferansi: null,
  acan: { kisiId: 3, kisiAdi: 'Deneme Açan', zaman: ZAMAN },
  emirId: null,
  gecmis: [{ kisiId: 3, kisiAdi: 'Deneme Açan', zaman: ZAMAN, olay: 'talep_gonderildi', imzaAnlami: null, aciklama: null, ozet: 'Talep gönderildi' }],
  surum: 4,
  ...ek,
});
