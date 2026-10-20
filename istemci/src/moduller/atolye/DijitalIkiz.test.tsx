import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { EmirlerCevabi, SonOlaylarCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AtolyeHaritasi } from './AtolyeHaritasi.tsx';
import { cerceveKur, ekranda, ikizPlani } from './ikiz.ts';

const OKUYAN: Kullanici = { id: 2, ad: 'Deneme Operatör', islemler: ['sayfa.atolye'] };

// Yerel saatle bugün 14:00; olaylar ve emirler bu güne göre.
const SIMDI = new Date(2026, 9, 14, 14, 0, 0);
const yerel = (saat: number, dakika = 0) => new Date(2026, 9, 14, saat, dakika).toISOString();

const istasyon = (istasyonId: number, kod: string, ad: string, x: string, hucre: string) => ({
  istasyonId, kod, ad, tip: 'talasli' as const, aktif: true, x, z: '5.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre,
  makineler: [], model: null, merkezModeli: null,
});

const YERLESIM = {
  salon: {
    id: 1, kod: 'S1', ad: 'Deneme salonu', genislik: '40.00', derinlik: '24.00', hucreBoyu: '4.00', surum: 3, fabrika: { x: '0.00', z: '0.00', donus: '0.0' },
    giris: null, kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z',
    sutunlar: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], satirlar: ['1', '2', '3', '4', '5', '6'],
  },
  makineYerleri: [],
  istasyonYerleri: [istasyon(5, 'CNC-01', 'Deneme Tezgahı', '5.00', 'B2'), istasyon(6, 'CNC-02', 'İkinci Tezgah', '25.00', 'G2')],
  raflar: [], alanlar: [], duvarlar: [], gecisler: [],
} satisfies YerlesimCevabi;

const EMIRLER = {
  emirler: [{
    id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1', parcaAd: 'Deneme kapak', adet: 40, istasyon: { id: 5, ad: 'Deneme Tezgahı' },
    durum: 'basladi', acan: { id: 1, ad: 'Deneme Yönetici' }, acilma: yerel(7), baslama: yerel(8),
    bitis: null, iptal: null, saglamAdet: null,
    canli: { calisma: 'durdu', saglam: 12, hurda: 1, durusNedeni: { id: 3, ad: 'Takım değişimi' }, durusBaslangic: yerel(13) },
  }],
} satisfies EmirlerCevabi;

const OLAYLAR = {
  olaylar: [
    {
      id: 'o2', olay: 'durdur', emir: { id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1' }, isEmri: { id: 300, opNo: 10, ad: 'Tornalama' }, makine: null,
      istasyon: { id: 5, ad: 'Deneme Tezgahı' }, kisi: { id: 2, ad: 'Deneme Operatör' }, adet: null, durusNedeni: { id: 3, ad: 'Takım değişimi' }, zaman: yerel(13),
    },
    {
      id: 'o1', olay: 'baslat', emir: { id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1' }, isEmri: { id: 300, opNo: 10, ad: 'Tornalama' }, makine: null,
      istasyon: { id: 5, ad: 'Deneme Tezgahı' }, kisi: { id: 2, ad: 'Deneme Operatör' }, adet: null, durusNedeni: null, zaman: yerel(8),
    },
  ],
} satisfies SonOlaylarCevabi;

function sunucuKur(bolumler: YerlesimCevabi[] = [YERLESIM]) {
  const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici: OKUYAN } satisfies OturumCevabi));
    if (yol === '/atolye/fabrika') return Promise.resolve(cevap({ bolumler }));
    if (yol.startsWith('/uretim-emirleri/son-olaylar')) return Promise.resolve(cevap(OLAYLAR));
    if (yol.startsWith('/arkon/son-olaylar')) return Promise.resolve(cevap({ olaylar: [] }));
    if (yol === '/makine-durumlari') return Promise.resolve(cevap({ kod: 'YETKISIZ', mesaj: 'Yetki yok' }, 403));
    if (yol.startsWith('/uretim-emirleri')) return Promise.resolve(cevap(EMIRLER));
    if (yol.startsWith('/atolye/goz-kalemleri')) return Promise.resolve(cevap({ kalemler: [] }));
    if (yol === '/atolye/kalem-gorunumleri') return Promise.resolve(cevap({ kalemler: [] }));
    if (yol.endsWith('/kroki')) return Promise.resolve(cevap({ kroki: null }));
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
}

// Tuval: jsdom çizmez; 2B bağlam yazılan metinleri kaydeden bir taklittir (WebGL istenince yok döner, sahne 3B kurulmaz).
let yazilanlar: string[] = [];
const TUVAL = { width: 800, height: 400 };

beforeEach(() => {
  yazilanlar = [];
  sunucuKur();
  // jsdom'da PointerEvent yok; imleç konumu fare olayının alanlarıyla taşınır.
  if (typeof PointerEvent === 'undefined') vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SIMDI);
  const baglam = new Proxy({}, {
    get: (_h, ad) => (ad === 'fillText' ? (m: string) => { yazilanlar.push(m); } : ad === 'measureText' ? (m: string) => ({ width: m.length * 7 }) : () => undefined),
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((tur: string) => (tur === '2d' ? baglam : null)) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: TUVAL.width, bottom: TUVAL.height, width: TUVAL.width, height: TUVAL.height, toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function goster() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={['/atolye']}><QueryClientProvider client={istemci}><BildirimSaglayici><AtolyeHaritasi /></BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

async function ikizeGec() {
  goster();
  fireEvent.click(await screen.findByRole('tab', { name: /Dijital ikiz/ }));
  return screen.findByRole('img', { name: /Dijital ikiz · Deneme salonu/ });
}

// Nesnenin tuvaldeki merkezi; çizimin kenar payı yazı boyundan gelir (değişken yokken 12 px).
function merkez(kod: string) {
  const plan = ikizPlani([YERLESIM], false);
  const n = plan?.nesneler.find((o) => o.kod === kod);
  if (!plan || !n) throw new Error(`${kod} yok`);
  return ekranda(cerceveKur(plan.kutu, TUVAL.width, TUVAL.height, 12 * 2.6, 12 * 5), n);
}

describe('dijital ikiz görünümü', () => {
  it('görünüm seçilince ikiz çizilir: istasyon kodları ve harfli ızgara tuvale yazılır, sayılar canlı durumdan gelir', async () => {
    await ikizeGec();
    await waitFor(() => expect(yazilanlar).toEqual(expect.arrayContaining(['CNC-01', 'CNC-02', 'A', 'J', '1', '6'])));
    const ust = screen.getByText(/Duran/).closest('.tc-ikiz-rozetler') as HTMLElement;
    await waitFor(() => expect(within(ust).getByText(/Duran/).textContent).toBe('Duran 1'));
    expect(within(ust).getByText(/Çalışan/).textContent).toBe('Çalışan 0');
    expect(screen.getByRole('button', { name: 'Canlı' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('ipucu imlecin altındaki istasyonu, durumunu, emrini ve hücresini gösterir', async () => {
    const tuval = await ikizeGec();
    await waitFor(() => expect(yazilanlar).toContain('CNC-01'));
    const bir = merkez('CNC-01');
    fireEvent.pointerMove(tuval, { clientX: bir.x, clientY: bir.y });
    const ipucu = await screen.findByRole('tooltip');
    expect(within(ipucu).getByText('CNC-01 · Deneme Tezgahı')).toBeTruthy();
    expect(within(ipucu).getByText('Durdu')).toBeTruthy();
    expect(within(ipucu).getByText('Emir UE-000030')).toBeTruthy();
    expect(within(ipucu).getByText('Takım değişimi')).toBeTruthy();
    expect(within(ipucu).getByText('Hücre S1·B2 · kuyruk 0')).toBeTruthy();
    const iki = merkez('CNC-02');
    fireEvent.pointerMove(tuval, { clientX: iki.x, clientY: iki.y });
    await waitFor(() => expect(within(screen.getByRole('tooltip')).getByText('CNC-02 · İkinci Tezgah')).toBeTruthy());
    expect(within(screen.getByRole('tooltip')).getByText('İş yok')).toBeTruthy();
    fireEvent.pointerLeave(tuval);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('zaman kaydıracı geçmiş durumu seçer: 11:00 da istasyon olay defterine göre çalışıyordur, Canlı şimdiki duruma döner', async () => {
    const tuval = await ikizeGec();
    await waitFor(() => expect(yazilanlar).toContain('CNC-01'));
    const kaydirac = screen.getByRole('slider', { name: /Zaman makinesi/ });
    expect(kaydirac.getAttribute('max')).toBe(String(14 * 60));
    fireEvent.change(kaydirac, { target: { value: String(11 * 60) } });
    expect(screen.getByRole('button', { name: 'Canlı' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('11:00')).toBeTruthy();
    const bir = merkez('CNC-01');
    fireEvent.pointerMove(tuval, { clientX: bir.x, clientY: bir.y });
    const ipucu = await screen.findByRole('tooltip');
    expect(within(ipucu).getByText('Çalışıyor')).toBeTruthy();
    expect(within(ipucu).getByText('Emir UE-000030 · Op 10 · Tornalama')).toBeTruthy();
    fireEvent.change(kaydirac, { target: { value: String(7 * 60) } });
    await waitFor(() => expect(within(screen.getByRole('tooltip')).getByText('Bekliyor')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Canlı' }));
    await waitFor(() => expect(within(screen.getByRole('tooltip')).getByText('Durdu')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Canlı' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('veri yokken boş durum gösterilir, tuval çizilmez', async () => {
    sunucuKur([{ ...YERLESIM, istasyonYerleri: [] }]);
    goster();
    fireEvent.click(await screen.findByRole('tab', { name: /Dijital ikiz/ }));
    expect(await screen.findByText(/dijital ikiz çizilecek nesne bulamadı/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Dijital ikiz/ })).toBeNull();
  });
});

