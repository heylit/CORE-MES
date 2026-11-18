import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FirmaKodlariCevabi, FirmaKodu } from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { FirmaKoduSecimi, kayitliKodIpucu } from '../../ortak/veri/firma-kodlari.tsx';
import { FirmaKodlari } from './FirmaKodlari.tsx';

// 3399 a: Sistem Ayarları > Firma kodları. Kodlar uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const ORNA: FirmaKodu = { id: 1, kod: 'ORNA', ad: 'Ornek A', varsayilan: true, aktif: true, surum: 1 };
const ORNB: FirmaKodu = { id: 2, kod: 'ORNB', ad: 'Ornek B', varsayilan: false, aktif: false, surum: 3 };

function sunucuKur(kodlar: FirmaKodu[]) {
  const yazilanlar: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/firma-kodlari') return json(200, { firmaKodlari: kodlar } satisfies FirmaKodlariCevabi);
    if (yol.startsWith('/firma-kodlari/')) {
      const govde = JSON.parse(secenek.body ?? '{}') as Record<string, unknown>;
      yazilanlar.push({ yol, govde });
      return json(200, { ...ORNA, id: 9, kod: String(govde['kod'] ?? 'ORNB'), ad: String(govde['ad']) });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

function ac(ekran: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('firma kodları', () => {
  it('liste kod, ad, varsayılan ve durumla görünür; yazamayan Ekle ve Düzenle görmez', async () => {
    sunucuKur([ORNA, ORNB]);
    ac(<FirmaKodlari yazar={false} />);
    expect(await screen.findByText('ORNA')).toBeTruthy();
    expect(screen.getByText('Varsayılan')).toBeTruthy();
    expect(screen.getByText('Pasif')).toBeTruthy();
    expect(screen.queryByText('Firma kodu ekle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ORNA düzenle' })).toBeNull();
  });

  it('yeni kod büyük harfe çevrilir; bozuk kod kaydedilmez; geçerli kod uca gider', async () => {
    const yazilanlar = sunucuKur([ORNA]);
    ac(<FirmaKodlari yazar />);
    fireEvent.click(await screen.findByText('Firma kodu ekle'));
    fireEvent.change(screen.getByLabelText(/^Kod/), { target: { value: 'mm' } });
    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Deneme' } });
    expect(screen.getByText(/tür kısaltması \(HM/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Kod/), { target: { value: 'ornc' } });
    expect(screen.getByText('ORNC-TK-26-001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilanlar).toHaveLength(1));
    expect(yazilanlar[0]).toEqual({ yol: '/firma-kodlari/ekle', govde: { kod: 'ORNC', ad: 'Deneme', varsayilan: false } });
  });

  it('düzenlemede kod kilitli; varsayılan kodun varsayılanı ve aktifliği kaldırılamaz', async () => {
    const yazilanlar = sunucuKur([ORNA, ORNB]);
    ac(<FirmaKodlari yazar />);
    fireEvent.click(await screen.findByRole('button', { name: 'ORNA düzenle' }));
    expect((screen.getByLabelText(/^Kod/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Varsayılan') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Aktif') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Ornek A2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilanlar).toHaveLength(1));
    expect(yazilanlar[0]).toEqual({ yol: '/firma-kodlari/1/duzenle', govde: { ad: 'Ornek A2', varsayilan: true, aktif: true, surum: 1 } });
  });

  it('seçim alanı aktif kodları gösterir, kaydın kendi pasif kodunu korur; liste boşsa çizilmez', async () => {
    sunucuKur([ORNA, ORNB]);
    const { rerender } = render(<QueryClientProvider client={new QueryClient()}><FirmaKoduSecimi deger="ORNA" degistir={() => undefined} /></QueryClientProvider>);
    await screen.findByText('ORNA · Ornek A');
    expect(screen.queryByText(/ORNB/)).toBeNull();
    rerender(<QueryClientProvider client={new QueryClient()}><FirmaKoduSecimi deger="ORNB" degistir={() => undefined} /></QueryClientProvider>);
    expect(await screen.findByText('ORNB · Ornek B (pasif)')).toBeTruthy();
    cleanup();
    sunucuKur([]);
    render(<QueryClientProvider client={new QueryClient()}><FirmaKoduSecimi deger={null} degistir={() => undefined} /></QueryClientProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByLabelText('Firma kodu')).toBeNull();
  });

  it('kayıtlı belgenin ipucu kod numarada geçiyorsa "bu kodla verildi", geçmiyorsa "değişmez" der', () => {
    expect(kayitliKodIpucu('Teklif', 'ORNA-TK-26-062', 'ORNA')).toBe('Teklif numarası bu kodla verildi.');
    expect(kayitliKodIpucu('Teklif', 'TK-2026-007', 'ORNB')).toBe('Firma kodu kayıttan sonra değişmez.');
    expect(kayitliKodIpucu('Sipariş', 'SP-2026-001', null)).toBe('Firma kodu kayıttan sonra değişmez.');
  });
});
