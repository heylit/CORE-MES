import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { ProjeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import { ProjeMaliyeti } from './disari.ts';

// Biçim sunucunun cevabından (proje-maliyet.test.ts); iş emri kayıtlı hâl kurallar.test.ts örneklerinden.
const cevap = (fiyatGorunur: boolean, o: Partial<ProjeMaliyetCevabi> = {}): ProjeMaliyetCevabi => ({
  proje: { id: 7, kod: 'PM.1', ad: 'Maliyetli' },
  siparis: { id: 3, no: 'SIP-0003', termin: '2026-11-15', paraBirimi: 'TRY', tutar: fiyatGorunur ? 2000 : null },
  fiyatGorunur,
  bugun: '2026-10-19',
  gelir: fiyatGorunur ? 2000 : null,
  butce: null,
  hedef: 1000,
  plan: 1000,
  gerceklesen: 500,
  bugunePlan: 400,
  kalanPlan: 600,
  sapma: fiyatGorunur ? 100 : null,
  katkiPayi: fiyatGorunur ? 900 : null,
  katkiOrani: fiyatGorunur ? 0.45 : null,
  planlananKatkiOrani: fiyatGorunur ? 0.5 : null,
  karRiski: { gecikmeGunu: 5, gunlukOran: 0.3, tutar: fiyatGorunur ? 13.5 : null, ceza: null },
  kalemler: [
    { kalem: 'malzeme', plan: 0, gerceklesen: 0, sapmaOrani: null },
    { kalem: 'isleme', plan: 1000, gerceklesen: 500, sapmaOrani: 0.25 },
    { kalem: 'ayar', plan: 0, gerceklesen: 0, sapmaOrani: null },
    { kalem: 'fason', plan: null, gerceklesen: 30, sapmaOrani: null },
    { kalem: 'iscilik', plan: 0, gerceklesen: 0, sapmaOrani: null },
  ],
  haftalar: [
    { hafta: '2026-10-05', planBirikimli: 400, gerceklesenBirikimli: 500 },
    { hafta: '2026-10-12', planBirikimli: 1000, gerceklesenBirikimli: 500 },
  ],
  sapanIsEmirleri: fiyatGorunur ? [{ isEmriId: 1, emirNo: 'UE-1', opNo: 10, istasyonAd: 'Torna', plan: 400, gerceklesen: 500, sapma: 100, neden: 'isleme' }] : [],
  eksikKalemler: ['fason'],
  eksikler: [],
  ...o,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    yollar.push(`${secenek?.method ?? 'GET'} ${yol}`);
    if (yol === '/proje-maliyet/7') return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><MemoryRouter><ProjeMaliyeti projeId={7} /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje maliyet sekmesi', () => {
  it('fiyat yetkilisine dört göstergeyi, kâr riskini, grafikleri ve sapan iş emirlerini gösterir', async () => {
    const yollar = sunucuKur(() => json(200, cevap(true)));
    cizdir();
    expect(await screen.findByText('Tahmini katkı payı')).toBeTruthy();
    // 236 a: ekran yalnız okur, deftere yazmaz.
    expect(yollar.filter((y) => y.includes('/proje-maliyet/7'))).toEqual(['GET /proje-maliyet/7']);
    expect(screen.getByText('Sipariş tutarı')).toBeTruthy();
    expect(screen.getByText('Bugüne kadarki sapma')).toBeTruthy();
    expect(screen.getByText('5 gün')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Plana git/ }).getAttribute('href')).toBe('/plan');
    expect(screen.getByRole('table', { name: 'En çok sapan iş emirleri' })).toBeTruthy();
    expect(screen.getByText(/Toplamlara girmeyen kalemler.*Fason/)).toBeTruthy();
  });

  it('fiyat yetkisi yoksa tutar, katkı, sapma ve kâr riski görünmez; maliyet görünür', async () => {
    sunucuKur(() => json(200, cevap(false)));
    cizdir();
    expect(await screen.findByText('Gerçekleşen maliyet')).toBeTruthy();
    expect(screen.queryByText('Sipariş tutarı')).toBeNull();
    expect(screen.queryByText('Tahmini katkı payı')).toBeNull();
    expect(screen.queryByText('Bugüne kadarki sapma')).toBeNull();
    expect(screen.queryByText(/Kâr riski/)).toBeNull();
    expect(screen.queryByRole('table', { name: 'En çok sapan iş emirleri' })).toBeNull();
  });

  it('bağlanmamış kaynak uyarı satırı olarak çıkar; maliyet boş gösterilir, sıfır yazılmaz', async () => {
    sunucuKur(() => json(200, cevap(true, {
      plan: null, gerceklesen: null, bugunePlan: null, kalanPlan: null, sapma: null, katkiPayi: null, haftalar: [], sapanIsEmirleri: [],
      kalemler: (['malzeme', 'isleme', 'ayar', 'fason', 'iscilik', 'genel_gider'] as const).map((kalem) => ({ kalem, plan: null, gerceklesen: null, sapmaOrani: null })),
      eksikKalemler: [], eksikler: ['is_emirleri_bagli_degil'],
    })));
    cizdir();
    expect(await screen.findByText(/Üretim emirlerinin süreleri henüz bağlanmadı/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0 TL')).toBeNull();
  });

  it('sunucu hatasında iletiyi gösterir', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } satisfies HataGovdesi));
    cizdir();
    expect(await screen.findByText(/yetkiniz yok/)).toBeTruthy();
  });
});
