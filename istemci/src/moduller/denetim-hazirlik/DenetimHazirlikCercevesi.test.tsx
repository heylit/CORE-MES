import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, OlcuAletleriCevabi, SorguCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { sayfaKur, yerelDegerler, YEREL } from './DenetimHazirlikCercevesi.tsx';
import { anahtarParcasi } from './cerceve-kopru.ts';
import { ekBetikler } from './ek-betikler.ts';
import { YONETIM_DUGMELERI_BETIGI } from './yonetim-dugmeleri.ts';
import { rotalar } from './rotalar.tsx';

// Kişi adları uydurmadır.
const YONETICI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim-hazirlik.yonet'] };
const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.ayarlar'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, kurulumGerekli = false, yonetici = true): string[] {
  const istekler: string[] = [];
  let kuruldu = !kurulumGerekli;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/denetim-hazirlik/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: true, yonetici, kurulumGerekli: !kuruldu } satisfies BenCevabi);
    }
    if (yontem === 'POST' && yol === '/denetim-hazirlik/kurulum') { kuruldu = true; return json(200, { kurulan: 1 }); }
    if (yontem === 'GET' && yol.startsWith('/denetim-hazirlik/sorgu')) return json(200, { belgeler: [], damga: 0 } satisfies SorguCevabi);
    if (yontem === 'GET' && yol === '/denetim-hazirlik/olcu-aletleri') return json(200, { aletler: [] } satisfies OlcuAletleriCevabi);
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

describe('DenetimHazirlikCercevesi', () => {
  it('prototipi içerik politikasıyla, köprüyle ve dış yazı tipi bağlantısı olmadan yalıtılmış çerçevede açar', async () => {
    sunucuKur(YONETICI);
    ac('/denetim-hazirlik');
    const cerceve = await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-forms allow-modals');
    expect(belge).toContain('Content-Security-Policy');
    expect(belge).toContain("connect-src 'none'");
    expect(belge).not.toMatch(/<link[^>]*fonts\.googleapis\.com/);
    expect(belge).not.toContain('calendar.google.com');
    expect(belge).not.toContain('>Google Takvim</a>');
    expect(belge).toContain('Takvime ekle');
    // Ortak Ctrl K paleti (karar 102 a): prototip palet öğelerini köprüye açar.
    expect(belge).toContain('window.__paletOgeleri=function(q){return palItems(q);};');
    // Köprü prototipin betiğinden önce koşar.
    expect(belge.indexOf('"kanal":"denetim-hazirlik"')).toBeGreaterThan(-1);
    expect(belge.indexOf('"kanal":"denetim-hazirlik"')).toBeLessThan(belge.indexOf('<body'));
    // Modülün ek betikleri (varsa) de prototipten önce gömülür.
    const ek = await ekBetikler();
    expect(belge.indexOf(ek.slice(0, 200))).toBeGreaterThan(-1);
    expect(belge.indexOf(ek.slice(0, 200))).toBeLessThan(belge.indexOf('<body'));
  });

  // Karar 102 a: çerçevede basılan Ctrl K kabuğun ortak paletini açar (kabuk tuşu pencerede dinler).
  it('çerçevenin Ctrl K iletisi kabukta Ctrl K olur; başka tuş ya da başka kanal olmaz', async () => {
    sunucuKur(YONETICI);
    ac('/denetim-hazirlik');
    const cerceve = await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 }) as HTMLIFrameElement;
    const tuslar: string[] = [];
    const dinle = (o: KeyboardEvent) => { tuslar.push(`${o.ctrlKey ? 'ctrl+' : ''}${o.key}`); };
    window.addEventListener('keydown', dinle);
    const gonder = (data: unknown) => { window.dispatchEvent(new MessageEvent('message', { data, origin: 'null', source: cerceve.contentWindow })); };
    gonder({ kanal: 'denetim-hazirlik', yon: 'kisayol', tus: 'baska' });
    gonder({ kanal: 'baska', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual([]);
    gonder({ kanal: 'denetim-hazirlik', yon: 'kisayol', tus: 'arama' });
    expect(tuslar).toEqual(['ctrl+k']);
    window.removeEventListener('keydown', dinle);
  });

  // 226 a: silme, sıfırlama ve yedekten yükleme düğmeleri yalnız yöneticide görünür (kural yonetim-dugmeleri.test.ts'de sınanır).
  it('yönetici olmayana yönetim düğmelerini gizleyen betik prototipten önce gömülür; yöneticiye gömülmez', async () => {
    sunucuKur(YONETICI, false, false);
    ac('/denetim-hazirlik');
    const yazar = (await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 })).getAttribute('srcdoc') ?? '';
    expect(yazar.indexOf(YONETIM_DUGMELERI_BETIGI)).toBeGreaterThan(-1);
    expect(yazar.indexOf(YONETIM_DUGMELERI_BETIGI)).toBeLessThan(yazar.indexOf('<body'));
    cleanup();
    sunucuKur(YONETICI);
    ac('/denetim-hazirlik');
    const yonetici = (await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 })).getAttribute('srcdoc') ?? '';
    expect(yonetici).not.toContain(YONETIM_DUGMELERI_BETIGI);
  });

  it('boş depoda yönetici açınca başlangıç kurulumunu bir kez çağırır', async () => {
    const istekler = sunucuKur(YONETICI, true);
    ac('/denetim-hazirlik');
    await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 });
    expect(istekler.filter((i) => i === 'POST /denetim-hazirlik/kurulum')).toHaveLength(1);
  });

  it('sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac('/denetim-hazirlik');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    await waitFor(() => { expect(istekler.some((i) => i.startsWith('GET /denetim-hazirlik/'))).toBe(false); });
  });

  it('ikinci menünün her maddesinin rotası vardır', () => {
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/denetim-hazirlik');
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
