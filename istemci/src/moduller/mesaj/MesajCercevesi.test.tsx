import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, SorguCevabi } from '#paylasilan/sozlesme/mesaj.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { sayfaKur, yerelDegerler, YEREL } from './MesajCercevesi.tsx';
import { anahtarParcasi } from './cerceve-kopru.ts';
import { rotalar } from './rotalar.tsx';

// Kişi adları uydurmadır.
const YONETICI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.mesaj', 'mesaj.oku', 'mesaj.yaz', 'mesaj.yonet'] };
const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.ayarlar'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, kurulumGerekli = false): string[] {
  const istekler: string[] = [];
  let kuruldu = !kurulumGerekli;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/mesaj/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: true, yonetici: true, kurulumGerekli: !kuruldu } satisfies BenCevabi);
    }
    if (yontem === 'POST' && yol === '/mesaj/kurulum') { kuruldu = true; return json(200, { kurulan: 1 }); }
    if (yontem === 'GET' && yol.startsWith('/mesaj/sorgu')) return json(200, { belgeler: [], damga: 0 } satisfies SorguCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MesajCercevesi', () => {
  it('prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar', async () => {
    sunucuKur(YONETICI);
    ac('/mesaj');
    const cerceve = await screen.findByTitle('Mesaj', {}, { timeout: 5000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-forms allow-modals');
    expect(belge).toContain('Content-Security-Policy');
    expect(belge).toContain("connect-src 'none'");
    expect(belge).not.toMatch(/<link[^>]*fonts\.googleapis\.com/);
    // Köprü prototipin betiğinden önce koşar.
    expect(belge.indexOf('"kanal":"mesaj"')).toBeGreaterThan(-1);
    expect(belge.indexOf('"kanal":"mesaj"')).toBeLessThan(belge.indexOf('<body'));
    // Excel kütüphanesi gömülmez (paket eklenmedi): prototipin dış adresten yükleme denemesini politika kapatır.
    expect(belge).toContain("script-src 'unsafe-inline';");
    expect(belge).not.toContain('window.XLSX=');
  });

  // Karar 102 a: çerçevede basılan Ctrl K kabuğun ortak paletini açar (kabuk tuşu pencerede dinler).
  it('çerçevenin Ctrl K iletisi kabukta Ctrl K olur; başka tuş ya da başka kanal olmaz', async () => {
    sunucuKur(YONETICI);
    ac('/mesaj');
    const cerceve = await screen.findByTitle('Mesaj', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const tuslar: string[] = [];
    const dinle = (o: KeyboardEvent) => { tuslar.push(`${o.ctrlKey ? 'ctrl+' : ''}${o.key}`); };
    window.addEventListener('keydown', dinle);
    const gonder = (data: unknown) => { window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: cerceve.contentWindow })); };
    gonder({ kanal: 'mesaj', yon: 'kisayol', tus: 'baska' });
    gonder({ kanal: 'baska', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual([]);
    gonder({ kanal: 'mesaj', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual(['ctrl+k']);
    window.removeEventListener('keydown', dinle);
  });

  it('boş depoda yönetici açınca başlangıç kurulumunu bir kez çağırır', async () => {
    const istekler = sunucuKur(YONETICI, true);
    ac('/mesaj');
    await screen.findByTitle('Mesaj', {}, { timeout: 5000 });
    expect(istekler.filter((i) => i === 'POST /mesaj/kurulum')).toHaveLength(1);
  });

  it('sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac('/mesaj');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    await waitFor(() => { expect(istekler.some((i) => i.startsWith('GET /mesaj/'))).toBe(false); });
  });

  it('ikinci menünün her maddesinin rotası vardır', () => {
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/mesaj');
    expect(menu).toBeDefined();
    for (const madde of menuMaddeleri(menu!)) expect(rotalar.some((r) => r.yol === madde.yol)).toBe(true);
  });

  it('sayfaKur dış yazı tipi bağlantısını çıkarır, politikayı ve betiği başa koyar', () => {
    const prototip = '<!doctype html><html><head><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet"><title>T</title></head><body>$&</body></html>';
    const sayfa = sayfaKur(prototip, '<script>kopru()</script>', '@font-face{}');
    expect(sayfa).not.toContain('fonts.g');
    expect(sayfa.indexOf('Content-Security-Policy')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa.indexOf('kopru()')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa).toContain('<body>$&</body>');
  });

  it('sayfaKur üretim adedi girişlerini gizler; sipariş aktarımı ve öteki düğmeler görünür (311 a)', () => {
    const govde = '<button data-act="o-entry">Üretim gir</button><form id="entInl"></form><button data-act="imp" data-v="prod">Üretim</button>'
      + '<button data-act="imp" data-v="orders">Sipariş</button><button data-act="o-edit">Düzenle</button>';
    const belge = new DOMParser().parseFromString(sayfaKur(`<html><head></head><body>${govde}</body></html>`, '', ''), 'text/html');
    document.head.insertAdjacentHTML('beforeend', `<style id="gizle-deneme">${belge.head.querySelector('style')!.textContent!}</style>`);
    document.body.innerHTML = belge.body.innerHTML;
    const gorunur = (s: string) => getComputedStyle(document.querySelector(s)!).display !== 'none';
    expect([gorunur('[data-act="o-entry"]'), gorunur('#entInl'), gorunur('[data-v="prod"]')]).toEqual([false, false, false]);
    expect([gorunur('[data-v="orders"]'), gorunur('[data-act="o-edit"]')]).toEqual([true, true]);
    document.getElementById('gizle-deneme')!.remove();
    document.body.innerHTML = '';
  });

  it('yerel depo kayıtları anahtarına çözülür; dize olmayan değer atlanır', () => {
    const anahtar = 'deneme:taslak (1)';
    const degerler = yerelDegerler({
      damga: 9,
      belgeler: [
        { yol: `yerel/${anahtarParcasi(anahtar)}`, kimlik: anahtarParcasi(anahtar), veri: { deger: '{"a":1}' }, surum: 4 },
        { yol: 'yerel/bozuk', kimlik: 'bozuk', veri: { deger: 3 }, surum: 5 },
      ],
    });
    expect(degerler).toEqual({ [anahtar]: { deger: '{"a":1}', surum: 4 } });
    expect(['ortak', 'kisisel', 'yok']).toContain(YEREL.kapsam);
  });
});
