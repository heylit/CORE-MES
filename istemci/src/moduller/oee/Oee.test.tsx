import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { OeeCevabi, OeeOlcusu } from '#paylasilan/sozlesme/oee.ts';
import { Oee, OeeMakineler } from './Oee.tsx';

// Biçim sunucunun cevabından (oee.test.ts, 1 kişi 3 makine): üretimsiz planlı makine ve maliyet yetkilisi.
const olcu = (o: Partial<OeeOlcusu> = {}): OeeOlcusu => ({
  planliDk: 480, takvimDk: 2880, calismaDk: 420, standartDk: 384, saglam: 98, hurda: 2, red: 0, suresizSaglam: 0,
  vardiyaDisi: { calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0, red: 0 },
  kullanilabilirlik: 0.875, veriEksik: false, performans: 0.9329, kalite: 0.98, oee: 0.8, teep: 0.1333, kisiPayi: 0.333,
  makineMaliyeti: 4800, iscilikMaliyeti: 800, birimMaliyet: 57.14, ...o,
});
const cevap = (maliyetGorunur: boolean): OeeCevabi => ({
  pencere: { baslangic: '2099-10-04T21:00:00.000Z', bitis: '2099-10-06T21:00:00.000Z' },
  maliyetGorunur,
  tesis: olcu({ kisiPayi: 1, birimMaliyet: maliyetGorunur ? 57.14 : null }),
  isMerkezleri: [{ id: 1, kod: 'IM-A', ad: 'Deneme merkez', ...olcu() }],
  istasyonlar: [{ id: 2, kod: 'IS-A', ad: 'Deneme istasyon', isMerkeziId: 1, ...olcu({ suresizSaglam: 4 }) }],
  makineler: [
    { id: 3, kod: 'M-1', ad: 'Deneme makine 1', istasyonId: 2, isMerkeziId: 1, ...olcu({ oee: 0.5 }) },
    { id: 4, kod: 'M-2', ad: 'Deneme makine 2', istasyonId: 2, isMerkeziId: 1, ...olcu({ planliDk: null, oee: null, kisiPayi: null }) },
  ],
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/oee?')) return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir(ekran: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}>{ekran}</QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('OEE ekranı', () => {
  it('son 7 günü okur; tesis özetini ve iş merkezi tablosunu gösterir', async () => {
    const yollar = sunucuKur(() => json(200, cevap(true)));
    cizdir(<Oee />);
    expect(await screen.findByText('OEE (vardiyaya göre)')).toBeTruthy();
    expect(yollar.some((y) => /^\/oee\?baslangic=\d{4}-\d{2}-\d{2}&bitis=\d{4}-\d{2}-\d{2}$/.test(y))).toBe(true);
    expect(screen.getAllByText('%80').length).toBeGreaterThan(0);
    expect(screen.getByText('Birim maliyet', { selector: '.tc-sayi-baslik' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'İş merkezleri' })).toBeTruthy();
    expect(screen.getByText('4 süresiz')).toBeTruthy();
  });

  it('maliyet yetkisi yoksa birim maliyet ne kartta ne tabloda görünür', async () => {
    sunucuKur(() => json(200, cevap(false)));
    cizdir(<Oee />);
    expect(await screen.findByText('OEE (vardiyaya göre)')).toBeTruthy();
    expect(screen.queryByText('Birim maliyet')).toBeNull();
  });

  it('makine bölümü bilinmeyen değeri tire ile gösterir, sıfır yazmaz', async () => {
    sunucuKur(() => json(200, cevap(true)));
    cizdir(<OeeMakineler />);
    const tablo = await screen.findByRole('table', { name: 'Makineler' });
    const satir = within(tablo).getByText('M-2').closest('tr')!;
    expect(within(satir).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(tablo).getByText('%50')).toBeTruthy();
  });

  it('verisi eksik makinede OEE ve performans yerine "Veri eksik" yazar; özet kaç makinenin girmediğini söyler', async () => {
    const c = cevap(true);
    c.makineler[0] = { ...c.makineler[0]!, ...olcu({ calismaDk: 7.4, standartDk: 420, veriEksik: true, oee: null, performans: null, teep: null }) };
    sunucuKur(() => json(200, c));
    cizdir(<OeeMakineler />);
    const tablo = await screen.findByRole('table', { name: 'Makineler' });
    const satir = within(tablo).getByText('M-1').closest('tr')!;
    expect(within(satir).getAllByText('Veri eksik')).toHaveLength(2);
    cleanup();
    sunucuKur(() => json(200, c));
    cizdir(<Oee />);
    expect(await screen.findByText(/1 makine veri eksik, girmedi/)).toBeTruthy();
  });

  it('red adedi rozetle, vardiya dışı çalışma ayrı kartta ve sütunda görünür; vardiya dışı yoksa kart çıkmaz', async () => {
    const c = cevap(true);
    c.tesis = { ...c.tesis, red: 3, vardiyaDisi: { calismaDk: 120, standartDk: 45, saglam: 30, hurda: 0, red: 0 } };
    c.makineler[0] = { ...c.makineler[0]!, red: 3, vardiyaDisi: { calismaDk: 120, standartDk: 45, saglam: 30, hurda: 0, red: 0 } };
    sunucuKur(() => json(200, c));
    cizdir(<OeeMakineler />);
    expect(await screen.findByText('Vardiya dışı', { selector: '.tc-sayi-baslik' })).toBeTruthy();
    expect(screen.getByText("30 sağlam; OEE'ye girmez")).toBeTruthy();
    expect(screen.getByText(/98 sağlam, 2 hurda, 3 red/)).toBeTruthy();
    const satir = within(screen.getByRole('table', { name: 'Makineler' })).getByText('M-1').closest('tr')!;
    expect(within(satir).getByText('3 red')).toBeTruthy();
    expect(within(satir).getByText('2 sa · 30 adet')).toBeTruthy();
    cleanup();
    sunucuKur(() => json(200, cevap(true)));
    cizdir(<Oee />);
    expect(await screen.findByText('OEE (vardiyaya göre)')).toBeTruthy();
    expect(screen.queryByText('Vardiya dışı', { selector: '.tc-sayi-baslik' })).toBeNull();
  });

  it('okuma hatasında yeniden dene kutusu çıkar', async () => {
    sunucuKur(() => json(500, { kod: 'IC_HATA', mesaj: 'Deneme hata' }));
    cizdir(<Oee />);
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
