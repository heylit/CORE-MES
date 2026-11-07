import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ArkonBaglamiKaynagi, type ArkonBaglami } from '../../veri/baglam.ts';
import { KaliteGorunumu } from '../KaliteGorunumu.tsx';
import type { Is } from '../tipler.ts';

// 2196, 2196-1 a, 2196-2 a: kalite istasyonu terminalinde karar kuyruğu ve form. Değerler uydurmadır; uçlar Kalite Merkezi'nindir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KM_ONAY = ['kalite-merkezi.oku', 'kalite-merkezi.yaz', 'kalite-merkezi.onayla'];
const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
const ilk = { uretimEmriId: 3, isEmriId: 11, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Deneme', opNo: 20, adet: 5, kararBekleyenAdet: 1 };
const hatali = {
  id: 7, adet: 2, aciklama: null, uretimEmri: { emirNo: 'E-2', parcaNo: 'P-2' }, isEmri: { opNo: 30 }, kisi: { ad: 'Op' },
  hurdaNedeni: { ad: 'Çapak' }, hedefEmir: { emirNo: 'E-2' },
};

function sunucu(islemler: string[], g: { ilk?: unknown[]; hatali?: unknown[]; tpl?: Record<string, unknown>[] } = {}) {
  const yazmalar: { yol: string; govde: unknown }[] = [];
  const degisiklikler = (g.tpl ?? []).map(({ _id, ...govde }, i) => ({ koleksiyon: 'tpl', kimlik: String(_id), govde, surum: i + 1 }));
  const f = vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if ((istek?.method ?? 'GET') !== 'GET') {
      yazmalar.push({ yol, govde: typeof istek?.body === 'string' ? JSON.parse(istek.body) : null });
      if (yol.includes('/ilk-parca/')) return json({ adet: 1 });
      return json({ surum: 99, tamam: true });
    }
    if (yol === '/oturum') return json({ kullanici: { id: 2, ad: 'Deneme Kalite', islemler } });
    if (yol === '/kalite-merkezi/kimlik') return json({ kisi: { id: 2, ad: 'Deneme Kalite' }, yonetici: false, kisiler: [], onaylayabilir: islemler.includes('kalite-merkezi.onayla') });
    if (yol.startsWith('/kalite-merkezi/degisiklikler')) return json({ surum: degisiklikler.length, degisiklikler });
    if (yol === '/kalite-merkezi/olcu-aletleri') return json({ cihazlar: [] });
    if (yol === '/kalite-merkezi/ilk-parca/bekleyenler') return json({ emirler: g.ilk ?? [] });
    if (yol === '/kalite-merkezi/hatali/bekleyenler') return json({ kayitlar: g.hatali ?? [] });
    if (yol === '/kalite-merkezi/giris/bekleyenler') return json({ kayitlar: [] });
    return json({ kod: 'YOK', mesaj: yol }, 404);
  });
  vi.stubGlobal('fetch', f);
  return { yazmalar, fetch: f };
}

function ac(istekler: unknown[] = []) {
  const depo = { DB: { all: vi.fn(async () => istekler), get: vi.fn(async () => undefined), put: vi.fn(async () => {}) }, Bus: { on: () => () => {}, send: vi.fn() } };
  const baglam = { depo, kisi: { name: 'Deneme Kalite' }, ayarlar: { hurdaNedenleri: [{ code: 'C', l: 'Çapak' }, { code: 'O', l: 'Ölçü dışı', active: false }] } } as unknown as ArkonBaglami;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sar = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={istemci}><MemoryRouter><ArkonBaglamiKaynagi.Provider value={baglam}>{children}</ArkonBaglamiKaynagi.Provider></MemoryRouter></QueryClientProvider>
  );
  const is = { no: 'IE-2', part: 'Deneme', op: 'Op 40', target: 10, meas: {}, pins: [], empty: true } as unknown as Is;
  const soyle = vi.fn();
  render(<KaliteGorunumu istasyon="KAL" is={is} izinli olcebilir soyle={soyle} />, { wrapper: sar });
  return { soyle };
}

describe('kalite terminali sekmeleri', () => {
  it('yalnız okuyan kişide sekme yoktur; kuyruk istenmez', async () => {
    const { fetch } = sunucu(['kalite-merkezi.oku']);
    ac();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await screen.findByText('Bekleyen numune yok');
    expect(screen.queryByRole('tablist', { name: 'Kalite istasyonu' })).toBeNull();
    expect(fetch.mock.calls.some(([a]) => String(a).includes('/bekleyenler'))).toBe(false);
  });

  it('ilk parça numunesi kuyruğa yönlendirir; onay iş emri adımıyla Kalite Merkezi ucuna gider (2196-1 a)', async () => {
    const { yazmalar } = sunucu(KM_ONAY, { ilk: [ilk] });
    const { soyle } = ac([{ id: 'n1', pkgId: 'p', no: 'IE-2', part: 'D', machine: 'TOR', at: 1, status: 'waiting', results: {}, kaliteIstasyonu: 'KAL', ilkParca: true }]);
    const not = await screen.findByRole('note');
    expect(not.textContent).toContain('İlk parça kararı karar kuyruğunda');
    fireEvent.click(within(not).getByRole('button', { name: 'Kuyruğu aç' }));
    await screen.findByText('E-1 · OP20 · ilk parça');
    expect(screen.getByRole('tab', { name: /Karar kuyruğu · 1/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Onay/ }));
    fireEvent.click(screen.getByRole('button', { name: /Onay · yaz/ }));
    await waitFor(() => expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/ilk-parca/3/karar')?.govde).toEqual({ karar: 'onay', isEmriId: 11 }));
    await waitFor(() => expect(soyle).toHaveBeenCalledWith('İlk parça onaylandı: 1 adet', 'ok'));
  });

  it('şartlı kabul gerekçe adımında şart ister; kusur listesi istasyonun etkin hurda nedenleridir', async () => {
    sunucu(KM_ONAY, { hatali: [hatali] });
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Karar kuyruğu · 1/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /Şartlı kabul/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gerekçeye geç/ }));
    expect(screen.getByRole('status').textContent).toMatch(/şart/);
    expect(screen.getByRole('button', { name: 'Çapak' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ölçü dışı' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Müşteri sapma izniyle' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('kalite terminali formu (2196-2 a)', () => {
  it('işaretli şablon adım adım doldurulur; "Hayır" açıklama ister; onaya istasyon ve işle gider', async () => {
    const { yazmalar } = sunucu(KM_ONAY, { tpl: [
      { _id: 't1', kod: 'KF-40', ad: 'Son kontrol', rev: '01', dsl: '# Yüzey\n? Çapak yok', terminal: true },
      { _id: 't2', kod: 'KF-41', ad: 'Masa formu', rev: '00', dsl: '# A\n? B' },
    ] });
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: 'Formlar' }));
    expect(screen.queryByRole('button', { name: /KF-41/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /KF-40 · Son kontrol/ }));
    expect(screen.getByText('Çapak yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Hayır/ }));
    expect((screen.getByRole('button', { name: /Özete geç/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Uygunsuzluk var' }));
    fireEvent.click(screen.getByRole('button', { name: /Özete geç/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Onaya gönder/ }));
    await waitFor(() => expect(yazmalar.some((y) => /\/kayitlar\/frm\//.test(y.yol))).toBe(true));
    const y = yazmalar.find((x) => /\/kayitlar\/frm\//.test(x.yol))!;
    expect(JSON.stringify(y.govde)).toContain('"durum":"Onay bekliyor"');
    expect(JSON.stringify(y.govde)).toContain('"bolum":"KAL · IE-2 Op 40"');
    expect(JSON.stringify(y.govde)).toContain('"0_0":"Uygunsuzluk var"');
  });
});
