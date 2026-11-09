import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { DegerlendirmeCevabi, DegerlendirmeSatiri, KarneBileseni } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Degerlendirme } from './Degerlendirme.tsx';

// Örnek değerler uydurmadır.
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['musteri-tedarikci.oku'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['musteri-tedarikci.oku', 'musteri-tedarikci.karne-agirlik'] };
const AGIRLIK = { lot: 25, ppm: 15, zamaninda: 25, tam: 10, teklif: 5, satinAlma: 10, kalite: 10 } as const;
const SURUM = { surum: 2, agirliklar: AGIRLIK, gerekce: 'Başlangıç', degistiren: null, olusturma: '2026-11-09T10:00:00+03:00' };

function satir(firmaId: number, ad: string, d: Partial<Record<KarneBileseni, number>>, puan: number | null, sinif: 'A' | 'B' | 'C' | 'D' | null, yetersiz = false, onceki: number | null = null): DegerlendirmeSatiri {
  const grup = (...b: KarneBileseni[]) => { const v = b.map((x) => d[x]).filter((x) => x !== undefined); return v.length === 0 ? null : v[0]!; };
  return {
    firmaId, kod: `T-${firmaId}`, ad, fason: false, oncekiPuan: onceki,
    karne: {
      firmaId, donemBasi: '2025-11-09', donemSonu: '2026-11-09',
      teslim: { toplam: 10, zamaninda: 8, tam: 9, oran: 80 }, kalite: { lot: 5, kararlar: { kabul: 5 }, puan: 100 },
      hizmet: { sayi: 0, ortalama: null, puan: null }, kaliteDegerlendirmesi: { sayi: 0, ortalama: null, puan: null },
      bilesenler: (Object.keys(AGIRLIK) as KarneBileseni[]).map((anahtar) => ({ anahtar, deger: d[anahtar] ?? null, agirlik: AGIRLIK[anahtar], etkinAgirlik: null })),
      gruplar: { kalite: grup('lot', 'ppm'), teslim: grup('zamaninda', 'tam', 'teklif'), elle: null }, hesapSurumu: 2, puan, sinif, yetersizVeri: yetersiz,
    },
  };
}
const CEVAP: DegerlendirmeCevabi = {
  satirlar: [
    satir(1, 'Tedarikci Az', { zamaninda: 100 }, 100, null, true),
    satir(2, 'Tedarikci Orta', { lot: 80, zamaninda: 70 }, 75, 'B', false, 80),
    satir(3, 'Tedarikci Iyi', { lot: 96, zamaninda: 94 }, 95, 'A', false, 90),
    satir(4, 'Tedarikci Zayif', { lot: 50, zamaninda: 40 }, 45, 'D'),
  ],
  agirliklar: SURUM,
  kesildi: false,
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(kullanici: Kullanici) {
  const yazilan: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (secenek?.method === 'POST') { yazilan.push({ yol, govde: JSON.parse(String(secenek.body)) }); return json(200, { gecerli: { ...SURUM, surum: 3 }, gecmis: [] }); }
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/musteri-tedarikci/degerlendirme') return json(200, CEVAP);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' });
  }));
  return yazilan;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Degerlendirme /></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tedarikçi değerlendirme matrisi (2456)', () => {
  it('bileşenleri üç grup başlığı altında ağırlığıyla, verisi olmayanı "—" gösterir; puana göre sıralar, az veri en sonda', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Değerlendirme matrisi' });
    expect(within(tablo).getByRole('columnheader', { name: 'Kalite · otomatik %40' })).toBeTruthy();
    expect(within(tablo).getByRole('columnheader', { name: 'Satın alma ve teslim · otomatik %40' })).toBeTruthy();
    expect(within(tablo).getByRole('columnheader', { name: 'Elle verilen %20' })).toBeTruthy();
    expect(within(tablo).getAllByRole('meter', { name: 'Lot kabul' }).map((e) => e.getAttribute('aria-valuenow'))).toEqual(['96', '80', '50']);
    const zayif = within(tablo).getAllByRole('meter', { name: 'Zamanında' }).at(-2)!;
    expect(zayif.getAttribute('data-ton')).toBe('zayif');
    const adlar = within(tablo).getAllByText(/^Tedarikci /).map((e) => e.textContent);
    expect(adlar).toEqual(['Tedarikci Iyi', 'Tedarikci Orta', 'Tedarikci Zayif', 'Tedarikci Az']);
    expect(within(tablo).getByText('Az veri')).toBeTruthy();
    expect(within(tablo).getByText('▼ 5,0')).toBeTruthy();
    expect(within(tablo).getByText('▲ 5,0')).toBeTruthy();
  });

  it('sınıf süzgeci ve arama satırları daraltır', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Değerlendirme matrisi' });
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    expect(within(tablo).getAllByText(/^Tedarikci /).map((e) => e.textContent)).toEqual(['Tedarikci Zayif']);
    fireEvent.click(screen.getByRole('button', { name: 'Az veri' }));
    expect(within(tablo).getAllByText(/^Tedarikci /).map((e) => e.textContent)).toEqual(['Tedarikci Az']);
  });

  it('satıra basınca karne kartı açılır, satır seçili işaretlenir ve odak karta geçer', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Değerlendirme matrisi' });
    fireEvent.click(within(tablo).getByText('Tedarikci Orta'));
    const kart = await screen.findByLabelText('Seçili tedarikçi: Tedarikci Orta');
    await waitFor(() => expect(document.activeElement).toBe(kart));
    expect(within(tablo).getByText('Tedarikci Orta').closest('[aria-current="true"]')).toBeTruthy();
    expect(within(tablo).getByText('Tedarikci Iyi').closest('[aria-current="true"]')).toBeNull();
  });

  it('yetki: ağırlık düzenlemeyi yalnız karne-agirlik işlemi olan görür; gövde okunan sürümü ve toplamı 100 ağırlığı taşır', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await screen.findByRole('table', { name: 'Değerlendirme matrisi' });
    expect(screen.queryByRole('button', { name: 'Ağırlıkları düzenle' })).toBeNull();
    cleanup();
    const yazilan = sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ağırlıkları düzenle' }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Lot kabul/ }), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/^Gerekçe/), { target: { value: 'Deneme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByText(/^Toplam: %105/)).textContent).toBe('Toplam: %105 · Ağırlıkların toplamı 100 olmalı.');
    expect(screen.getByRole('textbox', { name: /^Lot kabul/ }).getAttribute('aria-invalid')).not.toBe('true');
    expect(yazilan).toHaveLength(0);
    for (const ad of [/^Lot kabul/, /^PPM/, /^Zamanında/, /^Tam teslim/, /^Teklife/]) fireEvent.change(screen.getByRole('textbox', { name: ad }), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Satın alma/ }), { target: { value: '50' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Kalite/ }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByText(/^Toplam: %100/)).textContent).toContain('toplam ağırlığı 0 olamaz');
    expect(yazilan).toHaveLength(0);
    for (const [ad, v] of [[/^Lot kabul/, '30'], [/^PPM/, '10'], [/^Zamanında/, '25'], [/^Tam teslim/, '10'], [/^Teklife/, '5'], [/^Satın alma/, '10'], [/^Kalite/, '10']] as const) {
      fireEvent.change(screen.getByRole('textbox', { name: ad }), { target: { value: v } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]).toEqual({
      yol: '/musteri-tedarikci/karne-agirliklari/degistir',
      govde: { surum: 2, agirliklar: { ...AGIRLIK, lot: 30, ppm: 10 }, gerekce: 'Deneme' },
    });
  });
});
