import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SatinAlmaAnaliziCevabi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { api } from '../../../ortak/veri/api.ts';
import { bayesMetni, guvenlikMetni, harcamaAltMetni, karneMetni, sureMetni, tahminMetni, tlMetni } from './kurallar.ts';
import { SatinAlmaAnalizi } from './SatinAlmaAnalizi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (2151).
const TEDARIKCI: SatinAlmaTedarikcisi = {
  firmaId: 1, ad: 'Deneme tedarik', siparisSatiri: 12,
  karne: { teslimToplam: 4, zamanindaOran: 75, kalitePuani: null, puan: null, sinif: null, yetersizVeri: true },
  zamanindaBayes: { ortalama: 66.7, alt90: 41.2 },
  gecikme: { teslim: 4, gecKalan: 1, ortalamaGun: 1.5, yuzde80Gun: 3, enCokGun: 6 },
  tedarikSuresi: { ornek: 3, ortancaGun: null, yuzde80Gun: null, teklifOrtancaGun: null },
};
const MALZEME: SatinAlmaTuketimMalzemesi = {
  malzemeNo: 7, ad: 'Deneme çubuk', gecmisAy: 9, seri: Array.from({ length: 24 }, (_, i) => (i < 15 ? null : 10)),
  degiskenlik: null, xyz: null, tahminAylik: null, tedarikSuresiGun: null, guvenlikStogu: null,
};
const RAPOR: SatinAlmaAnaliziCevabi = {
  hesaplanan: '2026-11-04T09:00:00.000Z',
  tedarikciler: [TEDARIKCI],
  sureGereken: 5,
  firmasizSatir: 2,
  harcama: { basTarih: '2025-11-05', bitTarih: '2026-11-04', toplamTl: 4900, kalemSayisi: 2, siniflar: { A: 1, B: 0, C: 1 },
    kalemler: [{ anahtar: 'a', ad: 'Deneme çubuk', tutarTl: 4800, pay: 98, sinif: 'A' }, { anahtar: 'b', ad: 'Deneme sarf', tutarTl: 100, pay: 2, sinif: 'C' }], kursuzSatir: 1 },
  fiyatDegisimleri: [{
    katalogId: '00000000-0000-4000-8000-000000000001', ad: 'Deneme çubuk', paraBirimi: 'EUR', birim: 'adet',
    onceki: { tarih: '2026-03-02', birimFiyat: 10, kur: 30 }, son: { tarih: '2026-06-01', birimFiyat: 10, kur: 36 },
    degisimTl: 60, fiyatEtkisiTl: 0, kurEtkisiTl: 60, degisimYuzde: 20,
  }],
  tuketim: { stokBagi: true, aylar: Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 7)), gereken: 12, malzemeler: [MALZEME] },
};

describe('satın alma analizi (2151)', () => {
  it('metinler: yetersiz veri sayısıyla yazılır, sıfır uydurulmaz', () => {
    expect(karneMetni(TEDARIKCI)).toBe('%75 (yetersiz veri: 4 teslim)');
    expect(karneMetni({ ...TEDARIKCI, karne: null })).toBe('Teslim kaydı yok');
    expect(bayesMetni(TEDARIKCI)).toBe('%66,7, en az %41,2');
    expect(bayesMetni({ ...TEDARIKCI, zamanindaBayes: null })).toBe('-');
    expect(sureMetni(TEDARIKCI, 5)).toBe('Yetersiz veri: 3 teslim, 5 gerekir');
    expect(sureMetni({ ...TEDARIKCI, tedarikSuresi: { ornek: 6, ortancaGun: 12, yuzde80Gun: 20, teklifOrtancaGun: 10 } }, 5)).toBe('12 gün, %80 20 gün (teklif 10 gün)');
    expect(tahminMetni(MALZEME, 12)).toBe('Yetersiz veri: 9 ay, 12 gerekir');
    expect(tahminMetni({ ...MALZEME, gecmisAy: 0 }, 12)).toBe('Stok hareketi yok');
    expect(guvenlikMetni({ ...MALZEME, tahminAylik: 5 })).toBe('Tedarik süresi bilinmiyor');
    expect(tlMetni(null)).toBe('-');
    expect(harcamaAltMetni(RAPOR.harcama)).toContain('Kuru girilmemiş 1 satır sayılmadı');
    expect(harcamaAltMetni({ ...RAPOR.harcama, toplamTl: null, kursuzSatir: 0 })).toBe('Son 12 ayda sipariş yok.');
  });

  it('sayfa: harcama, tedarikçi, fiyat ve tüketim bölümleri', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(RAPOR as never);
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SatinAlmaAnalizi /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText('Tedarikçi başarımı')).toBeTruthy();
    expect(screen.getAllByText('Deneme tedarik').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%75 (yetersiz veri: 4 teslim)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+60 TL (+%20)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yetersiz veri: 9 ay, 12 gerekir').length).toBeGreaterThan(0);
    expect(screen.getByText(/Firmaya bağlı olmayan 2 sipariş satırı/)).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/satin-alma-analiz');
  });
});
