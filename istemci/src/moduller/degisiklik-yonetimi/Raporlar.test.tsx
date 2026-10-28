import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { RaporCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Raporlar } from './Raporlar.tsx';

// Sentetik veri; biçim sözleşmenin cevap tipidir.
const rapor = (o: Partial<RaporCevabi> = {}): RaporCevabi => ({
  cevrim: [
    { emirNo: 'ECO-0001', sinif: 'D2', acilis: '2099-01-02', kapanis: '2099-01-16', isGunu: 10 },
    { emirNo: 'ECO-0002', sinif: 'P1', acilis: '2099-02-02', kapanis: '2099-02-09', isGunu: 5 },
  ],
  kararDagilimi: [
    { emirNo: 'ECO-0001', otomatik: 3, onayli: 1, mrb: 0 },
    { emirNo: 'ECO-0002', otomatik: 0, onayli: 0, mrb: 0 },
  ],
  rotaOlgunlugu: [{ malzeme: { malzemeId: 7, kod: 'DENEME-3', ad: 'Deneme braket' }, rotaRevizyonu: 4 }],
  maliyetler: [{ emirNo: 'ECO-0001', hurda: '100.10', rework: '0.20' }, { emirNo: 'ECO-0002', hurda: null, rework: null }],
  hurdaMaliyeti: '100.10',
  reworkMaliyeti: '0.20',
  engellenenNcDenemesi: null,
  ...o,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/degisiklik-yonetimi/raporlar') return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><Raporlar /></QueryClientProvider>);
}

const kart = (baslik: string) => screen.getByText(baslik, { selector: '.tc-sayi-baslik' }).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Raporlar', () => {
  it('sayı kartları: ortalama çevrim, kapanan, kayıpsız toplam maliyet; NC denemesi bağlı değilse veri yok', async () => {
    sunucuKur(() => json(200, rapor()));
    cizdir();
    await screen.findByText('Ortalama ECO çevrim süresi');
    expect(within(kart('Ortalama ECO çevrim süresi')).getByText('7,5 iş günü')).toBeTruthy();
    expect(within(kart('Kapanan ECO')).getByText('2')).toBeTruthy();
    expect(within(kart('Toplam değişiklik maliyeti')).getByText('100,30 TL')).toBeTruthy();
    expect(within(kart('Engellenen NC denemesi')).getByText('Veri yok')).toBeTruthy();
  });

  it('grafikler ECO başına çizilir; kararsız ECO yığında, maliyetsiz ECO maliyette yer almaz', async () => {
    sunucuKur(() => json(200, rapor()));
    cizdir();
    const yigin = await screen.findByRole('img', { name: 'Disposition modları' });
    expect(within(yigin).getByText('ECO-0001')).toBeTruthy();
    expect(within(yigin).queryByText('ECO-0002')).toBeNull();
    expect(screen.getByRole('img', { name: 'ECO çevrim süresi' })).toBeTruthy();
    expect(within(screen.getByRole('img', { name: 'Rota revizyonu' })).getByText(/4 revizyon/)).toBeTruthy();
    const maliyet = screen.getByRole('table', { name: 'Maliyet' });
    expect(within(maliyet).getAllByRole('row')).toHaveLength(1);
    expect(within(maliyet).getByText('100,30 TL')).toBeTruthy();
  });

  it('kapanan ECO ve maliyet yoksa sıfır uydurmaz', async () => {
    sunucuKur(() => json(200, rapor({ cevrim: [], kararDagilimi: [], rotaOlgunlugu: null, maliyetler: [], hurdaMaliyeti: null, reworkMaliyeti: null, engellenenNcDenemesi: 0 })));
    cizdir();
    await screen.findByText('Ortalama ECO çevrim süresi');
    expect(within(kart('Ortalama ECO çevrim süresi')).getByText('Veri yok')).toBeTruthy();
    expect(within(kart('Toplam değişiklik maliyeti')).getByText('Veri yok')).toBeTruthy();
    expect(screen.getByText('Maliyet bağlı değil.')).toBeTruthy();
    expect(screen.getByText('Bu dönemde karar yok.')).toBeTruthy();
    expect(screen.getByText('Rota revizyonları bağlı değil.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'ECO çevrim süresi' })).toBeNull();
  });

  it('alınamazsa hata gösterir', async () => {
    sunucuKur(() => json(500, { kod: 'SUNUCU_HATASI', mesaj: 'Beklenmeyen hata.' }));
    cizdir();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
