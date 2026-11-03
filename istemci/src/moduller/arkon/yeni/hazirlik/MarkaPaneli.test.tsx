import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { MarkalamaBirimi, MarkalamaTanimi } from '#paylasilan/sozlesme/markalama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '../../../../ortak/veri/api.ts';
import { MarkaPaneli, type IsDegisikligi, type PanelArayuzu } from './IstasyonPanelleri.tsx';
import type { IstasyonAyari } from './kurallar.ts';
import type { Order, Pkg } from './tipler.ts';

// 2028: terminalin markalama paneli seriyi istemcide üretmez; Markalama modülünün uçlarına gider, iş kaydına seri yazmaz.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const TANIM: MarkalamaTanimi = {
  id: 7, malzemeId: 11, malzemeKodu: 'ORN-A', opNo: 40, seriSablonu: '{PARCA}-{SEQ:5}', sayacKapsami: 'malzeme', baslangicSirasi: 1, dogrulama: true, aktif: true,
  model: null, surum: 3, degismeZamani: '2026-10-27T08:00:00Z', alanlar: [],
};
const birim = (b: Partial<MarkalamaBirimi> = {}): MarkalamaBirimi => ({
  id: 31, seriNo: 'ORN-A-00004', tanimId: 7, malzemeId: 11, uretimEmriId: 5, istasyonId: 21, durum: 'saglam', dogrulamaZamani: null, surum: 1,
  zaman: '2026-10-27T09:00:00Z', ...b,
});
const ISTASYONLAR: IstasyonSecimiCevabi = {
  gruplar: [{ isMerkeziId: 1, isMerkeziKod: 'DNM', isMerkeziAd: 'Deneme Merkezi', istasyonlar: [{ id: 21, kod: 'DNM-L1', ad: 'Lazer 1', isMerkeziId: 1, tip: 'markalama', aktif: true }] }],
};

interface Cagri { yol: string; yontem: string; govde: unknown; kimlik: string | null }

function sunucuKur(islemler: string[], tanimlar: MarkalamaTanimi[] = [TANIM]) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, kimlik: new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol === '/oturum') return json(200, { kullanici: { id: 3, ad: 'Deneme Operatör', islemler } });
    if (yol === '/istasyonlar/secim') return json(200, ISTASYONLAR);
    if (yol === '/markalama/tanimlar?malzemeId=11') return json(200, { tanimlar });
    if (yol === '/markalama/tanimlar/7/onizleme?emirId=5') return json(200, { numaralar: ['ORN-A-00005', 'ORN-A-00006'] });
    if (yol === '/markalama/emirler/5/ozet?tanimId=7') return json(200, { uretimEmriId: 5, sayilar: { saglam: 4, red: 0, rework: 0, hurda: 1 }, dogrulanan: 3 });
    if (yol === '/markalama/birimler?emirId=5&tanimId=7') return json(200, { birimler: [birim(), birim({ id: 30, seriNo: 'ORN-A-00003', durum: 'hurda' })] });
    if (yol === '/markalama/birimler/markala') return json(200, birim({ id: 32, seriNo: 'ORN-A-00005' }));
    if (yol === '/markalama/birimler/dogrula') return json(200, birim({ dogrulamaZamani: '2026-10-27T09:05:00Z' }));
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

const PAKET = { id: 'p1', no: 'UE-DNM-1', partNo: 'ORN-A', part: 'Deneme parça', machine: 'DNM-L1', malzemeNo: 11, tmi: { emirId: 5, isEmriId: 9, opNo: 40 } } as unknown as Pkg;
const AYAR = { method: 'lazer', pos: 'Flanş yüzü', fmt: '{PARCA}-{SEQ:4}', start: 1, verify: false } as IstasyonAyari;

function ac(paket: Pkg = PAKET) {
  let is = { good: 0, scrap: 0, sr: {} } as unknown as Order;
  const yap = vi.fn();
  const sessiz = vi.fn((f: IsDegisikligi) => { is = { ...is, ...f(is) }; });
  const soyle = vi.fn();
  const okundu: { f: ((kod: string) => void) | null } = { f: null };
  const api: PanelArayuzu = {
    is, paket, ayar: AYAR, kayit: {}, yap, sessiz, soyle, okut: (o) => { okundu.f = o.okundu; },
  };
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><MarkaPaneli api={api} /></QueryClientProvider>);
  return { yap, sessiz, soyle, okundu, sayim: () => is };
}

describe('terminal markalama paneli (2028)', () => {
  it('sıradaki seri sunucudan gelir; Markalandı çift dokunuşta tek istek, istasyonla gider ve yalnız sayım artar', async () => {
    const cagrilar = sunucuKur(['sayfa.uretim-terminali', 'markalama.seri-ver']);
    const p = ac();
    expect(await screen.findByText('ORN-A-00005', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('ORN-A-00006')).toBeTruthy();
    expect(screen.getByText('4 iyi · 1 hatalı · 3 doğrulandı')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: /Markalandı/ }) as HTMLButtonElement).disabled).toBe(false));
    const dugme = screen.getByRole('button', { name: /Markalandı/ });
    fireEvent.click(dugme);
    fireEvent.click(dugme);
    await waitFor(() => expect(p.soyle).toHaveBeenCalledWith('Markalandı · ORN-A-00005', 'run'));
    const markalar = cagrilar.filter((c) => c.yol === '/markalama/birimler/markala');
    expect(markalar).toHaveLength(1);
    expect(markalar[0]!.govde).toEqual({ tanimId: 7, uretimEmriId: 5, istasyonId: 21, sonuc: 'iyi' });
    expect(markalar[0]!.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.yap).not.toHaveBeenCalled();
    expect(p.sayim().good).toBe(1);
    expect(p.soyle).toHaveBeenCalledTimes(1);
    expect(p.sayim().sr).toEqual({});
  });

  it('doğrulama sunucuya gider; tanımda doğrulama açıksa düğme görünür', async () => {
    const cagrilar = sunucuKur(['sayfa.uretim-terminali', 'markalama.seri-ver']);
    const p = ac();
    fireEvent.click(await screen.findByRole('button', { name: /Doğrula/ }));
    p.okundu.f!('ORN-A-00004');
    await waitFor(() => expect(p.soyle).toHaveBeenCalledWith('Doğrulandı · ORN-A-00004 (son parça)', 'run'));
    expect(cagrilar.find((c) => c.yol === '/markalama/birimler/dogrula')!.govde).toEqual({ tanimId: 7, seriNo: 'ORN-A-00004' });
  });

  it('seri verme yetkisi yoksa düğmeler kapalıdır ve istek gitmez', async () => {
    const cagrilar = sunucuKur(['sayfa.uretim-terminali']);
    ac();
    expect(await screen.findByText('Seri vermek için markalama yetkisi gerekir.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Markalandı/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
  });

  it('bu operasyonda tanım yoksa seri verilmez', async () => {
    sunucuKur(['sayfa.uretim-terminali', 'markalama.seri-ver'], [{ ...TANIM, opNo: 50 }]);
    ac();
    expect(await screen.findByText('Bu parça ve operasyon için markalama tanımı yok; seri verilmez.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Markalandı/ })).toBeNull();
  });

  it('CORE emrine bağlı olmayan işte Markalama\'ya istek gitmez', async () => {
    const cagrilar = sunucuKur(['sayfa.uretim-terminali', 'markalama.seri-ver']);
    ac({ ...PAKET, tmi: undefined } as Pkg);
    expect(await screen.findByText('Bu iş CORE emrine bağlı değil; seri verilmez.')).toBeTruthy();
    expect(cagrilar.filter((c) => c.yol.startsWith('/markalama/'))).toEqual([]);
  });
});
