import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { KaliciEkranlar } from '../../ortak/rota/kalici.tsx';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { rotaninSayfasi } from '../../ortak/rota/sayfa.ts';
import { ArkonCercevesi, UretimTerminali, tmiAdresi } from './ArkonCercevesi.tsx';
import { rotalar } from './rotalar.tsx';

// Üretim Terminali: Arkon'un operatör ekranı ana menüde kendi sayfa işlemiyle (rollere Çekirdek göçüyle verilir).
describe('Üretim Terminali', () => {
  const operator = ['arkon.operator', 'sayfa.arkon', 'sayfa.uretim-terminali'];
  const gorunur = SAYFALAR.filter((s) => operator.includes(s.islem));

  it('sayfa.uretim-terminali olmayan kullanıcı görmez, olan görür', () => {
    const yollar = (islemler: string[]) => SAYFALAR.filter((s) => islemler.includes(s.islem)).map((s) => s.yol);
    expect(yollar(['arkon.operator', 'sayfa.arkon'])).not.toContain('/uretim-terminali');
    expect(yollar(operator)).toContain('/uretim-terminali');
  });

  it('operatör ana menüde Üretim grubunda görür ve ekranı kurulur', () => {
    const sayfa = gorunur.find((s) => s.yol === '/uretim-terminali');
    expect(sayfa).toMatchObject({ baslik: 'Üretim Terminali', grup: 'Üretim' });
    expect(rotalar.map((r) => r.yol)).toContain('/uretim-terminali');
    // Rota planı ekranı yolun sayfasının işlemiyle kurar.
    expect(rotaninSayfasi('/uretim-terminali')).toBe('/uretim-terminali');
  });

  it('çerçeveli tek maddelik menüyle açılır', () => {
    const menu = IKINCI_MENULER.find((m) => m.kok === '/uretim-terminali');
    expect(menu?.cerceveli).toBe(true);
    expect(menu?.gruplar.flatMap((g) => g.maddeler).filter((m) => maddeGorunurMu(m, operator)).map((m) => m.yol)).toEqual(['/uretim-terminali']);
  });

  it('terminalde adres terminalde kalır; Arkon MES sayfaları /arkon altındadır', () => {
    expect(tmiAdresi('/uretim-terminali', '')).toBe('/uretim-terminali');
    expect(tmiAdresi('/uretim-terminali', 'ayarlar')).toBe('/uretim-terminali');
    expect(tmiAdresi('/arkon', '')).toBe('/arkon/operator');
    expect(tmiAdresi('/arkon', 'kalite')).toBe('/arkon/kalite');
  });
});

// Çerçevedeki Arkon sayfa değiştirince (adres işareti) TMI adresi güncellenir; terminalde adres yerinde kalır.
describe('Arkon çerçevesi adresi', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function ac(baslangic: string, isaret: string): Promise<string> {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'operator', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    function Adres() { adres = useLocation().pathname; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={[baslangic]}>
            <Routes>
              <Route path="/uretim-terminali" element={<UretimTerminali />} />
              <Route path="/arkon" element={<ArkonCercevesi />} />
              <Route path="/arkon/:sayfa" element={<ArkonCercevesi />} />
            </Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    const pencere = cerceve.contentWindow!;
    act(() => { cerceve.dispatchEvent(new Event('load')); });
    act(() => {
      pencere.history.replaceState(null, '', `#${isaret}`);
      pencere.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    return adres;
  }

  it('terminalde Arkon başka sayfaya geçse de adres terminalde kalır', async () => {
    expect(await ac('/uretim-terminali', 'ayarlar')).toBe('/uretim-terminali');
  });

  it('Arkon MES\'te adres Arkon sayfasını izler', async () => {
    expect(await ac('/arkon', 'kalite')).toBe('/arkon/kalite');
  });
});

describe('Üretim Terminali kalıcıdır', () => {
  it('terminal rotası kalıcı, Arkon MES ve Kuyruk değil', () => {
    const kalici = rotalar.filter((r) => r.kalici === true).map((r) => r.yol);
    expect(kalici).toEqual(['/uretim-terminali']);
  });
});

describe('gizli terminal adresi çekmez', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('kullanıcı başka sayfadayken Arkon sayfa değiştirse de adres yerinde kalır; görünürken terminale döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'operator', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    let git: NavigateFunction = () => undefined;
    function Adres() { adres = useLocation().pathname; git = useNavigate(); return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/uretim-terminali']}>
            <KaliciEkranlar rotalar={[{ yol: '/uretim-terminali', ekran: UretimTerminali, kalici: true }]} />
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    const pencere = cerceve.contentWindow!;
    act(() => { cerceve.dispatchEvent(new Event('load')); });
    const isaret = (i: string) => act(() => { pencere.history.replaceState(null, '', `#${i}`); pencere.dispatchEvent(new HashChangeEvent('hashchange')); });
    act(() => { void git('/stok'); });
    isaret('ayarlar');
    expect(adres).toBe('/stok');
    expect(ekran.container.querySelector('iframe')).toBe(cerceve);
    act(() => { void git('/uretim-terminali'); });
    isaret('operator');
    expect(adres).toBe('/uretim-terminali');
  });
});

// Ctrl K'den emir seçimi (kullanıcı kararı 16.10): /uretim-terminali?emir=<id> çerçeveye bırakılır, adresten silinir.
describe('Üretim Terminali emir seçimi', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function ac(baslangic: string, yukleme = 1): Promise<{ pencere: Window & { __tmiEmirSec?: number }; olay: number; adres: () => string }> {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kisi: { kimlik: '7', ad: 'Deneme', rol: 'operator', isMerkezleri: [], aktif: true } }))));
    let adres = '';
    function Adres() { const l = useLocation(); adres = l.pathname + l.search; return null; }
    const ekran = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={[baslangic]}>
            <Routes>
              <Route path="/uretim-terminali" element={<UretimTerminali />} />
              <Route path="/arkon/:sayfa" element={<ArkonCercevesi />} />
            </Routes>
            <Adres />
          </MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
    const cerceve = await waitFor(() => { const c = ekran.container.querySelector('iframe'); if (!c) throw new Error('çerçeve yok'); return c; });
    const pencere = cerceve.contentWindow! as Window & { __tmiEmirSec?: number };
    let olay = 0;
    pencere.addEventListener('tmi-emir-sec', () => { olay += 1; });
    expect(pencere.__tmiEmirSec, 'çerçeve yüklenmeden istek bırakılmaz').toBeUndefined();
    act(() => { for (let i = 0; i < yukleme; i += 1) cerceve.dispatchEvent(new Event('load')); });
    return { pencere, get olay() { return olay; }, adres: () => adres };
  }

  it('geçerli emir çerçeveye bırakılır, duyurulur ve adresten silinir', async () => {
    const s = await ac('/uretim-terminali?emir=42');
    expect(s.pencere.__tmiEmirSec).toBe(42);
    expect(s.olay).toBe(1);
    await waitFor(() => expect(s.adres()).toBe('/uretim-terminali'));
  });

  it('adres silinmeden gelen ikinci yükleme isteği yeniden göndermez', async () => {
    const s = await ac('/uretim-terminali?emir=42', 2);
    expect(s.olay).toBe(1);
    await waitFor(() => expect(s.adres()).toBe('/uretim-terminali'));
  });

  it('geçersiz emir parametresi ve Arkon MES sayfası çerçeveye istek bırakmaz', async () => {
    for (const a of ['/uretim-terminali?emir=abc', '/uretim-terminali?emir=0', '/uretim-terminali?emir=-3', '/arkon/kalite?emir=42']) {
      const s = await ac(a);
      expect(s.pencere.__tmiEmirSec, a).toBeUndefined();
      expect(s.olay, a).toBe(0);
      cleanup();
    }
  });
});
