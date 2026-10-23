import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KmDegisiklikCevabi, KmKimlikCevabi, KmOlcuAletleriCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/Bildirim.tsx';
import { KaliteMerkeziYeni } from './KaliteMerkeziYeni.tsx';
import type { KmKoleksiyonu } from './tipler.ts';

// Testlerin ortak kurulumu: sahte sunucu (oturum, kimlik, akış, ölçü aletleri, yazma uçları) ve yeni ekranın açılışı. Veri uydurmadır.
const KAPI: Islem = 'kisiler.rol-yonet';
const KM: Islem[] = ['kalite-merkezi.oku', 'kalite-merkezi.yaz', 'kalite-merkezi.onayla', 'kalite-merkezi.geri-yukle'];

export interface TestKullanicisi { kullanici: Kullanici; yonetici: boolean }
export const YONETICI: TestKullanicisi = { kullanici: { id: 1, ad: 'Deneme Yönetici', islemler: [KAPI, ...KM] }, yonetici: true };
// Kapı yöneticide; muhendis ve muayeneci görünümleri doğrudan açılır (kmAc kapıyı atlamaz, kapisiz: true ile atlar).
export const MUHENDIS: TestKullanicisi = { kullanici: { id: 2, ad: 'Deneme Mühendis', islemler: [KAPI, 'kalite-merkezi.oku', 'kalite-merkezi.yaz', 'kalite-merkezi.onayla'] }, yonetici: false };
export const MUAYENECI: TestKullanicisi = { kullanici: { id: 3, ad: 'Deneme Muayeneci', islemler: [KAPI, 'kalite-merkezi.oku', 'kalite-merkezi.yaz'] }, yonetici: false };
export const OKUYAN: TestKullanicisi = { kullanici: { id: 4, ad: 'Deneme Okuyan', islemler: [KAPI, 'kalite-merkezi.oku'] }, yonetici: false };
export const KAPISIZ: TestKullanicisi = { kullanici: { id: 5, ad: 'Deneme Kapısız', islemler: KM }, yonetici: false };

export type TestKayitlari = Partial<Record<KmKoleksiyonu | 'settings', Record<string, unknown>[]>>;

export interface Yazma { yol: string; govde: unknown }

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Kayıtlar `_id` taşır; `dev` ölçü aletleri ucundan, ötekiler akıştan gelir. `ret` verilen yol 403 döner (izinsiz deneme).
export function sunucuKur(k: TestKullanicisi, kayitlar: TestKayitlari = {}, secenek: { ret?: (yol: string) => boolean } = {}) {
  const yazmalar: Yazma[] = [];
  let surum = 0;
  const degisiklikler: KmDegisiklikCevabi['degisiklikler'] = [];
  for (const [koleksiyon, liste] of Object.entries(kayitlar)) {
    if (koleksiyon === 'dev') continue;
    for (const r of liste ?? []) {
      const { _id, ...govde } = r;
      degisiklikler.push({ koleksiyon, kimlik: String(_id), govde, surum: ++surum });
    }
  }
  const cihazlar: KmOlcuAletleriCevabi['cihazlar'] = (kayitlar.dev ?? []).map(({ _id, ...govde }) => ({ kimlik: String(_id), govde }));
  const kimlik: KmKimlikCevabi = { kisi: { id: k.kullanici.id, ad: k.kullanici.ad }, yonetici: k.yonetici, kisiler: [], onaylayabilir: k.kullanici.islemler.includes('kalite-merkezi.onayla') };
  const fetchSahte = vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    const yontem = istek?.method ?? 'GET';
    if (yontem !== 'GET') {
      const govde: unknown = typeof istek?.body === 'string' ? JSON.parse(istek.body) : null;
      yazmalar.push({ yol, govde });
      if (secenek.ret?.(yol)) return json(403, { kod: 'YETKI', mesaj: 'Bu işlem için yetkiniz yok.' });
      return json(200, { surum: ++surum, tamam: true });
    }
    if (yol === '/oturum') return json(200, { kullanici: k.kullanici });
    if (yol === '/kalite-merkezi/kimlik') return json(200, kimlik);
    if (yol.startsWith('/kalite-merkezi/degisiklikler')) {
      const sonra = Number(new URL(yol, 'http://x').searchParams.get('sonra') ?? 0);
      return json(200, { surum, degisiklikler: degisiklikler.filter((d) => d.surum > sonra) } satisfies KmDegisiklikCevabi);
    }
    if (yol === '/kalite-merkezi/olcu-aletleri') return json(200, { cihazlar } satisfies KmOlcuAletleriCevabi);
    if (yol.endsWith('/gecmis')) return json(200, { surumler: [] });
    if (yol === '/kalite-merkezi/ilk-parca/bekleyenler') return json(200, { emirler: [] });
    return json(404, { kod: 'YOK', mesaj: yol });
  });
  vi.stubGlobal('fetch', fetchSahte);
  return { yazmalar, fetch: fetchSahte };
}

// Yeni ekranı verilen görünümde açar (`/kalite-merkezi/yeni/<gorunum>`; Bugün için boş).
export function kmAc(gorunum: string, k: TestKullanicisi = YONETICI, kayitlar: TestKayitlari = {}, secenek: { ret?: (yol: string) => boolean } = {}) {
  const sunucu = sunucuKur(k, kayitlar, secenek);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const adres = gorunum ? `/kalite-merkezi/yeni/${gorunum}` : '/kalite-merkezi/yeni';
  const sonuc = render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            <Route path="/kalite-merkezi/yeni" element={<KaliteMerkeziYeni />} />
            <Route path="/kalite-merkezi/yeni/:gorunum" element={<KaliteMerkeziYeni />} />
            <Route path="*" element={<p>eski ekran</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return { ...sunucu, ...sonuc, istemci };
}

// Kayıt yazma uçlarına giden gövdeler (koleksiyon ve kimlikle).
export const kayitYazmalari = (yazmalar: readonly Yazma[], koleksiyon?: string) =>
  yazmalar.filter((y) => /\/kalite-merkezi\/kayitlar\/[^/]+\/[^/]+\/(yaz|onayla)$/.test(y.yol) && (!koleksiyon || y.yol.includes(`/kayitlar/${koleksiyon}/`)));
