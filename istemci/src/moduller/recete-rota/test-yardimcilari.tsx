import { expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

// Kişi adları uydurmadır.
export const YAZAR: Kullanici = { id: 5, ad: 'Deneme Yazar', islemler: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz', 'plan.oku', 'recete-rota.planlama-oku'] };
export const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.ayarlar'] };
// Kart #1372: rotanın ilk adımına giren zorunludur; prototip örneklerinin ilk adımı bu hammaddeyi tüketir (stoğu yeter, maliyeti var: uyarı vermez).
export const HAM = { id: 'h0', code: 'HM-000', name: 'Deneme hammadde', type: 'ham', unit: 'kg', cost: 1, stock: 100000, min: 0 };
export const HAM_GIRDISI = { id: 'g0', itemId: 'h0', qty: 0.1, scrap: 0, status: '' };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

export function sunucuKur(kullanici: Kullanici, kayitlar: KayitlarCevabi['kayitlar'] = [], yazabilir = true): string[] {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/ben') return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/recete-rota/kayitlar') return json(200, { kayitlar } satisfies KayitlarCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

const Konum = () => <output data-testid="konum">{useLocation().pathname}</output>;

export function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Konum />
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

export const yazilan: Array<{ tip: string; veri: unknown }> = [];
// Prototipin kabuğa yolladığı menü sayaçları iletileri (kanal tmi-gorunum, tip sayaclar), sırayla.
export const sayacIletileri: Array<Record<string, number | null>> = [];
let yazmaDinleyici: ((e: MessageEvent) => void) | null = null;
export const bekle = (ms: number) => new Promise<void>((coz) => { setTimeout(coz, ms); });
export function yazmaDinleyiciKapat(): void {
  if (yazmaDinleyici !== null) window.removeEventListener('message', yazmaDinleyici);
  yazmaDinleyici = null;
}

// jsdom srcdoc çerçevesinde betik koşturmaz; sayfa boş bir çerçeveye yazılarak gerçekten çalıştırılır ve ilk çizim beklenir.
// Köprünün çerçeveden kabuğa yolladığı kayıt yazma iletileri `yazilan` listesinde toplanır.
export async function prototipiCalistir(html: string): Promise<Document> {
  yazmaDinleyiciKapat();
  yazilan.length = 0;
  sayacIletileri.length = 0;
  yazmaDinleyici = (e: MessageEvent) => {
    const m = e.data as { kanal?: string; yon?: string; tip?: string; veri?: unknown; sayaclar?: Record<string, number | null> } | null;
    if (m?.kanal === 'tmi-gorunum' && m.tip === 'sayaclar' && m.sayaclar) sayacIletileri.push(m.sayaclar);
    if (m?.kanal === 'recete-rota' && m.yon === 'istek' && m.tip === 'kayit-yaz') yazilan.push({ tip: m.tip, veri: m.veri });
  };
  window.addEventListener('message', yazmaDinleyici);
  const cerceve = document.createElement('iframe');
  document.body.appendChild(cerceve);
  // jsdom çerçeve penceresinde TextEncoder yok; köprünün yazma yolu boyut denetiminde ona ihtiyaç duyar.
  (cerceve.contentWindow as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
  // jsdom'da CSS.escape yok; şema çizimi onu kullanır.
  (cerceve.contentWindow as unknown as { CSS: { escape: (x: string) => string } }).CSS = { escape: (x) => x };
  const belge = cerceve.contentDocument!;
  belge.open();
  belge.write(html);
  belge.close();
  await waitFor(() => { expect(cerceve.contentDocument?.querySelector('#sync')).not.toBeNull(); }, { timeout: 10000 });
  return cerceve.contentDocument!;
}
