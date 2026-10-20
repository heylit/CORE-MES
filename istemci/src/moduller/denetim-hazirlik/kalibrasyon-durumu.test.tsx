import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, OlcuAletleriCevabi, SorguCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';
import { rotalar } from './rotalar.tsx';

// "Kalibrasyon" sekmesinin vade ve durum hesabını sabitler. Durum Kalibrasyon modülünün kuralıyla hesaplanır (tek kural); çerçevenin
// sunduğu sayfadan yalnız bu saf işlevlerin tanımları ayıklanıp kuralla birlikte kurulur. Kişi adı uydurmadır.
const KISI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

async function sunulanSayfa(): Promise<string> {
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    if (yol === '/oturum') return json(200, { kullanici: KISI } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/denetim-hazirlik/ben') {
      return json(200, { kisi: { id: KISI.id, ad: KISI.ad }, yazabilir: true, yonetici: false, kurulumGerekli: false } satisfies BenCevabi);
    }
    if (yontem === 'GET' && yol.startsWith('/denetim-hazirlik/sorgu')) return json(200, { belgeler: [], damga: 0 } satisfies SorguCevabi);
    if (yontem === 'GET' && yol === '/denetim-hazirlik/olcu-aletleri') return json(200, { aletler: [] } satisfies OlcuAletleriCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/denetim-hazirlik']}>
      <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
  const cerceve = await screen.findByTitle('Denetim Hazırlığı', {}, { timeout: 5000 });
  return cerceve.getAttribute('srcdoc') ?? '';
}

function islev(satirlar: string[], ad: string): string {
  const i = satirlar.findIndex((s) => s.startsWith(`function ${ad}(`));
  if (i < 0) throw new Error(`Sayfadan ayıklanamadı: ${ad}`);
  let derinlik = 0;
  const cikti: string[] = [];
  for (let k = i; k < satirlar.length; k++) {
    const satir = satirlar[k] ?? '';
    cikti.push(satir);
    for (const ch of satir) {
      if (ch === '{') derinlik++;
      else if (ch === '}') derinlik--;
    }
    if (derinlik === 0) break;
  }
  return cikti.join('\n');
}

interface Cihaz { st: string; last: string; per: number; nx: string }
interface Durum { k: string; t: string; dd: number | null }
interface Hesap { kNext(d: Cihaz): string; kStat(d: Cihaz): Durum; kTableHtml(devs: Record<string, unknown>[]): string }

let h: Hesap;
beforeAll(async () => {
  const sayfa = await sunulanSayfa();
  // Kural prototipin betiğinden önce gömülüdür; prototip cihaz durumunu kendisi hesaplamaz.
  expect(sayfa.indexOf(kalibrasyonKuraliBetigi())).toBeGreaterThan(-1);
  expect(sayfa.indexOf(kalibrasyonKuraliBetigi())).toBeLessThan(sayfa.indexOf('function kStat('));
  const satirlar = sayfa.split('\n');
  const KDUR = satirlar.find((s) => s.startsWith('var KDUR='));
  if (!KDUR) throw new Error('Sayfadan ayıklanamadı: KDUR');
  const KSON = satirlar.find((s) => s.startsWith('var KSON='));
  if (!KSON) throw new Error('Sayfadan ayıklanamadı: KSON');
  const tablo = ['esc', 'ic', 'fmtDate', 'dBetween', 'KL', 'kCycle', 'kList', 'kChip', 'kBar', 'kToolbar', 'kTableHtml'].map((ad) => islev(satirlar, ad));
  const kod = [
    'let state={kal:{devs:[],view:"tablo",filter:"all",q:""}};', 'const window={};', kalibrasyonKuraliBetigi(), KDUR, KSON,
    ...['pad', 'isoOf', 'todayISO', 'kKural', 'kNext', 'kStat'].map((ad) => islev(satirlar, ad)), ...tablo,
    'return {kNext,kStat,kTableHtml:function(devs){state={kal:{devs:devs,view:"tablo",filter:"all",q:""}};return kTableHtml();}};',
  ];
  h = new Function(kod.join('\n'))() as Hesap;
});
afterAll(() => { cleanup(); vi.unstubAllGlobals(); });

const cihaz = (c: Partial<Cihaz>): Cihaz => ({ st: 'aktif', last: '', per: 12, nx: '', ...c });

describe('Denetim Hazırlığı kalibrasyon durumu (kStat)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('vade son kalibrasyon + periyot (ay); ay sonu kısalır; elle girilen sonraki tarih önce gelir', () => {
    expect(h.kNext(cihaz({ last: '2025-10-15' }))).toBe('2026-10-15');
    expect(h.kNext(cihaz({ last: '2026-08-31', per: 1 }))).toBe('2026-09-30');
    expect(h.kNext(cihaz({ last: '2025-01-01', nx: '2026-10-20' }))).toBe('2026-10-20');
    expect(h.kNext(cihaz({}))).toBe('');
  });

  // 329 a: liste Kalibrasyondan gelir; metinler prototipin çiziminde kaçışlanır (cihaz kaydı olcu-aleti.ts'nin ürettiği biçimdedir).
  it('XSS: Kalibrasyondan gelen cihaz metinleri tabloda kaçışlanır', () => {
    const zarar = '<img src=x onerror=alert(1)>';
    const html = h.kTableHtml([{
      id: 'kal-1', no: zarar, ad: zarar, marka: '', seri: '', aralik: zarar, coz: '', yer: zarar, sorumlu: '', lab: '', cert: zarar, kabul: '', note: '',
      st: 'aktif', res: 'uygun', per: 3, last: '2026-10-01', nx: '2026-12-30', tur: 'dis', hist: [],
    }]);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    const kap = document.createElement('div');
    kap.innerHTML = html;
    expect(kap.querySelector('img')).toBeNull();
  });

  it.each([
    [cihaz({ st: 'disi', last: '2020-01-01' }), 'pasif', 'Kullanım dışı', null],
    [cihaz({ st: 'yedek' }), 'pasif', 'Yedek', null],
    [cihaz({}), 'yok', 'Kalibrasyon kaydı yok', null],
    [cihaz({ last: '2025-10-14' }), 'gec', '1 gün gecikti', -1],
    [cihaz({ last: '2025-10-15' }), 'bugun', 'Bugün', 0],
    [cihaz({ last: '2025-10-22' }), 'cokyak', '7 gün kaldı', 7],
    [cihaz({ last: '2025-10-23' }), 'yak', '8 gün kaldı', 8],
    [cihaz({ last: '2025-11-14' }), 'yak', '30 gün kaldı', 30],
    [cihaz({ last: '2025-11-15' }), 'ok', '31 gün kaldı', 31],
    [cihaz({ last: '2025-01-01', nx: '2026-10-20' }), 'cokyak', '5 gün kaldı', 5],
  ] as [Cihaz, string, string, number | null][])('%j -> %s', (d, k, t, dd) => {
    const s = h.kStat(d);
    expect({ k: s.k, t: s.t, dd: s.dd }).toEqual({ k, t, dd });
  });
});
