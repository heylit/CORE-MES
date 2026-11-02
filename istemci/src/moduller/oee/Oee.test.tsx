import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { OeeCevabi, OeeOlcusu } from '#paylasilan/sozlesme/oee.ts';
import { Oee, OeeMakineler, donemiUnut } from './Oee.tsx';

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
    { id: 3, kod: 'M-1', ad: 'Deneme makine 1', istasyonId: 2, isMerkeziId: 1, aktif: true, ...olcu({ oee: 0.5 }) },
    { id: 4, kod: 'M-2', ad: 'Deneme makine 2', istasyonId: 2, isMerkeziId: 1, aktif: true, ...olcu({ planliDk: null, oee: null, kisiPayi: null }) },
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); donemiUnut(); });

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
    expect(within(satir).getAllByText('Veri eksik')).toHaveLength(1);
    cleanup();
    sunucuKur(() => json(200, c));
    cizdir(<Oee />);
    expect(await screen.findByText(/1 makine veri eksik, girmedi/)).toBeTruthy();
    // Üst satırlar tire gösterir; nedeni adın yanında yazılır.
    const istasyon = within(screen.getByRole('table', { name: 'İstasyonlar' })).getByText('IS-A').closest('tr')!;
    expect(within(istasyon).getByText('Veri eksik: 1')).toBeTruthy();
    const merkez = within(screen.getByRole('table', { name: 'İş merkezleri' })).getByText('IM-A').closest('tr')!;
    expect(within(merkez).getByText('Veri eksik: 1')).toBeTruthy();
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
    expect(within(satir).getByText('2 sa')).toBeTruthy();
    expect(within(satir).getByText('30 adet')).toBeTruthy();
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

  it('seçilen dönem bölüm değişince korunur', async () => {
    const yollar = sunucuKur(() => json(200, cevap(true)));
    cizdir(<Oee />);
    await screen.findByText('OEE (vardiyaya göre)');
    fireEvent.click(screen.getByText('Tarih seç'));
    fireEvent.change(screen.getByLabelText('Başlangıç'), { target: { value: '2099-10-05' } });
    fireEvent.change(screen.getByLabelText('Bitiş'), { target: { value: '2099-10-06' } });
    expect(await screen.findByText('OEE (vardiyaya göre)')).toBeTruthy();
    cleanup();
    yollar.length = 0;
    cizdir(<OeeMakineler />);
    await screen.findByRole('table', { name: 'Makineler' });
    expect((screen.getByLabelText('Başlangıç') as HTMLInputElement).value).toBe('2099-10-05');
    expect(yollar).toContain('/oee?baslangic=2099-10-05&bitis=2099-10-06');
  });

  it('ters ya da 92 günü aşan aralıkta sunucunun nedeni yazılır, yeniden dene sunulmaz', async () => {
    const hata = (mesaj: string) => json(400, { kod: 'DOGRULAMA', mesaj, alan: 'bitis' } satisfies HataGovdesi);
    sunucuKur(() => json(200, cevap(true)));
    cizdir(<Oee />);
    await screen.findByText('OEE (vardiyaya göre)');
    sunucuKur(() => hata('Bitiş başlangıçtan önce olamaz.'));
    fireEvent.click(screen.getByText('Tarih seç'));
    fireEvent.change(screen.getByLabelText('Başlangıç'), { target: { value: '2099-10-06' } });
    fireEvent.change(screen.getByLabelText('Bitiş'), { target: { value: '2099-10-05' } });
    expect(await screen.findByText('Bitiş başlangıçtan önce olamaz.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
  });

  it('sunucu 400 dönerse iletisini yazar, yeniden dene sunmaz', async () => {
    sunucuKur(() => json(400, { kod: 'DOGRULAMA', mesaj: 'En çok 92 gün okunur.', alan: 'bitis' } satisfies HataGovdesi));
    cizdir(<Oee />);
    expect(await screen.findByText('En çok 92 gün okunur.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
  });

  it('pasif makine adının yanında "Pasif" rozetiyle görünür', async () => {
    const c = cevap(true);
    c.makineler[1] = { ...c.makineler[1]!, aktif: false };
    sunucuKur(() => json(200, c));
    cizdir(<OeeMakineler />);
    const tablo = await screen.findByRole('table', { name: 'Makineler' });
    expect(within(within(tablo).getByText('M-2').closest('tr')!).getByText('Pasif')).toBeTruthy();
    expect(within(within(tablo).getByText('M-1').closest('tr')!).queryByText('Pasif')).toBeNull();
  });

  it('tesis maliyeti bilinmezse maliyeti eksik makineler yazılır; özet süreleri makine-saattir', async () => {
    const c = cevap(true);
    c.tesis = { ...c.tesis, makineMaliyeti: null, birimMaliyet: null };
    c.makineler[1] = { ...c.makineler[1]!, makineMaliyeti: null, birimMaliyet: null };
    sunucuKur(() => json(200, c));
    cizdir(<Oee />);
    expect(await screen.findByText(/Maliyeti eksik: M-2 \(/)).toBeTruthy();
    expect(screen.getByText('Planlı 8 makine-sa')).toBeTruthy();
    expect(screen.getByText('Takvim 48 makine-sa')).toBeTruthy();
  });

  it('tarih seçici bugünden ileri gün sunmaz', async () => {
    sunucuKur(() => json(200, cevap(true)));
    cizdir(<Oee />);
    await screen.findByText('OEE (vardiyaya göre)');
    fireEvent.click(screen.getByText('Tarih seç'));
    const bitis = screen.getByLabelText('Bitiş') as HTMLInputElement;
    expect(bitis.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bitis.max).toBe(bitis.value);
    expect((screen.getByLabelText('Başlangıç') as HTMLInputElement).max).toBe(bitis.value);
  });
});
