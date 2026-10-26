import { vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  KmDegisiklikCevabi, KmEmirKaynagi, KmEmirKaynaklariCevabi, KmKimlikCevabi, KmOlcuAletleriCevabi, KmParcaKaynagi, KmParcaKaynaklariCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/Bildirim.tsx';
import { KaliteMerkeziYeni } from './KaliteMerkeziYeni.tsx';
import { STUDYO_YOLLARI } from './sekmeler.ts';
import type { KmKoleksiyonu } from './tipler.ts';

// Testlerin ortak kurulumu: sahte sunucu (oturum, kimlik, akış, ölçü aletleri, yazma uçları) ve yeni ekranın açılışı. Veri uydurmadır.
const KM: Islem[] = ['kalite-merkezi.oku', 'kalite-merkezi.yaz', 'kalite-merkezi.onayla', 'kalite-merkezi.geri-yukle'];

export interface TestKullanicisi { kullanici: Kullanici; yonetici: boolean }
export const YONETICI: TestKullanicisi = { kullanici: { id: 1, ad: 'Deneme Yönetici', islemler: KM }, yonetici: true };
// Ekran sayfayı gören herkesindir (582): rol ayrımı yalnız Kalite Merkezi işlemlerindendir.
export const MUHENDIS: TestKullanicisi = { kullanici: { id: 2, ad: 'Deneme Mühendis', islemler: ['kalite-merkezi.oku', 'kalite-merkezi.yaz', 'kalite-merkezi.onayla'] }, yonetici: false };
export const MUAYENECI: TestKullanicisi = { kullanici: { id: 3, ad: 'Deneme Muayeneci', islemler: ['kalite-merkezi.oku', 'kalite-merkezi.yaz'] }, yonetici: false };
export const OKUYAN: TestKullanicisi = { kullanici: { id: 4, ad: 'Deneme Okuyan', islemler: ['kalite-merkezi.oku'] }, yonetici: false };
// Yeni ekran kapısı (yönetici işlemi) olmayan kalite kullanıcısı: geçişten sonra ekranı açar.
export const KAPISIZ: TestKullanicisi = { kullanici: { id: 5, ad: 'Deneme Kapısız', islemler: KM }, yonetici: false };
export const YETKISIZ: TestKullanicisi = { kullanici: { id: 6, ad: 'Deneme Yetkisiz', islemler: [] }, yonetici: false };

export type TestKayitlari = Partial<Record<KmKoleksiyonu | 'settings', Record<string, unknown>[]>>;

export interface Yazma { yol: string; govde: unknown }

// `emirler` sahiplerden gelen iş emri ve siparişler (null: uç hata verir), `parcalar` Malzemeler kartları (592); `ret` verilen yol 403 döner (izinsiz deneme).
export interface SunucuSecenegi { ret?: (yol: string) => boolean; emirler?: KmEmirKaynagi[] | null; parcalar?: KmParcaKaynagi[] }

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// Kayıtlar `_id` taşır; `dev` ölçü aletleri ucundan, ötekiler akıştan gelir.
export function sunucuKur(k: TestKullanicisi, kayitlar: TestKayitlari = {}, secenek: SunucuSecenegi = {}) {
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
    if (yol === '/kalite-merkezi/emir-kaynaklari' && secenek.emirler === null) return json(500, { kod: 'SUNUCU', mesaj: 'Deneme hata' });
    if (yol === '/kalite-merkezi/emir-kaynaklari') return json(200, { emirler: secenek.emirler ?? [] } satisfies KmEmirKaynaklariCevabi);
    if (yol.startsWith('/kalite-merkezi/parca-kaynaklari')) {
      const q = new URL(yol, 'http://x').searchParams;
      const idler = q.get('idler')?.split(',').map(Number);
      const ara = (q.get('ara') ?? '').toLocaleLowerCase('tr');
      const parcalar = (secenek.parcalar ?? []).filter((p) => (idler ? idler.includes(p.malzemeNo) : `${p.kod} ${p.ad ?? ''}`.toLocaleLowerCase('tr').includes(ara)));
      return json(200, { parcalar } satisfies KmParcaKaynaklariCevabi);
    }
    return json(404, { kod: 'YOK', mesaj: yol });
  });
  vi.stubGlobal('fetch', fetchSahte);
  return { yazmalar, fetch: fetchSahte };
}

// Kabuğun ikinci menü şeridinin yerine: seçili görünümü adresten gösterir (ekran kendi bölüm sekmesini çizmez, 553 1 a).
export const kmAdresi = (): string => screen.getByTestId('km-adres').textContent ?? '';
let gezgin: NavigateFunction | null = null;
function Adres() {
  gezgin = useNavigate();
  return <output data-testid="km-adres" hidden>{useLocation().pathname}</output>;
}
// Şeritteki maddeye tıklamanın yerine: görünümü adresle açar (ekran aynı kalır, durumu korunur).
export function kmGit(gorunum: string): void {
  act(() => { void gezgin?.(gorunum ? `/kalite-merkezi/${gorunum}` : '/kalite-merkezi'); });
}

// Yeni ekranı verilen görünümde açar (`/kalite-merkezi/<gorunum>`; Bugün için boş). Stüdyo görünümleri çerçevededir (217 b).
export function kmAc(gorunum: string, k: TestKullanicisi = YONETICI, kayitlar: TestKayitlari = {}, secenek: SunucuSecenegi = {}) {
  const sunucu = sunucuKur(k, kayitlar, secenek);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const adres = gorunum ? `/kalite-merkezi/${gorunum}` : '/kalite-merkezi';
  const sonuc = render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Adres />
          <Routes>
            <Route path="/kalite-merkezi" element={<KaliteMerkeziYeni />} />
            {STUDYO_YOLLARI.map((y) => <Route key={y} path={y} element={<p>eski ekran</p>} />)}
            <Route path="/kalite-merkezi/:gorunum" element={<KaliteMerkeziYeni />} />
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
