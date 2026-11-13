import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MakineBulgulariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { MakineBulgulari } from './MakineBulgulari.tsx';

const SIMDI = '2026-11-13T10:40:00.000Z';
const hucre = (metin: string | null, ton: 'tamam' | 'uyari' | 'hata' | 'pasif' = 'tamam') => ({ metin, ton });
const bos = hucre(null, 'pasif');
const CEVAP: MakineBulgulariCevabi = {
  okumaAcik: true, sonOkuma: SIMDI,
  kutular: [
    { tur: 'durum', deger: '1 / 2', alt: 'çalışıyor · 0 alarm, 1 bekliyor', ton: 'uyari' },
    { tur: 'durus', deger: '1', alt: 'toplam 14 dk nedensiz', ton: 'hata' },
    { tur: 'sayim', deger: '1', alt: 'en büyük fark 6 adet', ton: 'hata' },
    { tur: 'program', deger: null, alt: null, ton: 'pasif' }, { tur: 'cevrim', deger: null, alt: null, ton: 'pasif' },
    { tur: 'bitis', deger: '0', alt: null, ton: 'tamam' },
    { tur: 'oee', deger: null, alt: null, ton: 'pasif' }, { tur: 'oran', deger: null, alt: null, ton: 'pasif' }, { tur: 'yuk', deger: null, alt: null, ton: 'pasif' },
    { tur: 'alarm', deger: '0', alt: null, ton: 'tamam' },
  ],
  bulgular: [
    { id: 'd1', tur: 'durus', ton: 'hata', makineKodu: 'ORN-M02', makineAdi: 'ORN torna 2', emirNo: null, opNo: null, baslik: '14 dakikadır duruyor, duruş nedeni girilmemiş', hesap: 'Çalışmıyor 10:26–şimdi = 14 dk (eşik 3 dk)', ne: 'Operatör terminalde duruş nedenini seçer.', zaman: SIMDI },
    { id: 's1', tur: 'sayim', ton: 'hata', makineKodu: 'ORN-M01', makineAdi: 'ORN torna 1', emirNo: 'ORN-UE-1', opNo: 20, baslik: 'makine 52 saydı, operatör 46 girdi', hesap: 'fark 6 (tolerans 2)', ne: 'Sayım kontrol edilir.', zaman: SIMDI },
  ],
  karne: [
    { makineKodu: 'ORN-M01', makineAdi: 'ORN torna 1', hucreler: { durum: hucre('Çalışıyor'), durus: bos, sayim: hucre('52 / 46', 'hata'), program: bos, cevrim: bos, bitis: bos, oee: bos, oran: bos, yuk: bos, alarm: hucre('0') } },
  ],
  grafikler: {
    cizelge: { baslangic: '2026-11-13T03:00:00.000Z', bitis: '2026-11-13T11:00:00.000Z', simdi: SIMDI, satirlar: [
      { makineKodu: 'ORN-M02', parcalar: [{ baslangic: '2026-11-13T03:00:00.000Z', bitis: '2026-11-13T10:26:00.000Z', tur: 'calisiyor', not: '' }, { baslangic: '2026-11-13T10:26:00.000Z', bitis: SIMDI, tur: 'nedensiz', not: '' }] },
    ] },
    duruslar: [{ etiket: 'Nedeni girilmemiş', deger: 14 }],
    sayim: null,
  },
};

function ac(cevap: MakineBulgulariCevabi) {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(cevap), { status: 200 })));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici><MakineBulgulari /></BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES Makine bulguları (3192 D1)', () => {
  it('on kutu görünür; hesaplanmayan kutu sıfır değil "Veri yok" der; kutu seçilince liste o türe iner ve nasıl hesaplandığı yazar', async () => {
    ac(CEVAP);
    const kutular = await screen.findAllByRole('button', { pressed: false });
    expect(kutular.filter((k) => k.classList.contains('tc-mb-kutu'))).toHaveLength(10);
    expect(screen.getAllByText('Veri yok').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/14 dakikadır duruyor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sayım farkı/, pressed: false }));
    expect(screen.queryByText(/14 dakikadır duruyor/)).toBeNull();
    expect(screen.getByText(/makine 52 saydı/)).toBeTruthy();
    expect(screen.getByLabelText('Sayım farkı: nasıl hesaplanır')).toBeTruthy();
  });

  it('okuma kapalıyken bulgu yerine açma yolu yazar', async () => {
    ac({ ...CEVAP, okumaAcik: false, kutular: [], bulgular: [], karne: [], grafikler: null });
    expect(await screen.findByText(/Canlı makine okuması kapalı/)).toBeTruthy();
  });
});
