import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GunlukMesaiCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { GunlukMesaiEkrani } from './GunlukMesai.tsx';

const TAKVIM: TakvimCevabi = {
  vardiyalar: [
    { id: 1, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 },
    { id: 2, ad: 'Gece', baslangic: '22:00', bitis: '06:00', aktif: true, surum: 1, molalar: [], netDakika: 480 },
  ],
  matris: [],
  gunler: [{ tarih: '2026-10-29', tur: 'tatil', ad: 'Cumhuriyet Bayramı' }],
  isMerkezleri: [{ id: 10, kod: 'IM-A', ad: 'Deneme A', aktif: true, haftalikDakika: 450 }],
  kadro: [], kisiVardiyalari: [],
  bugun: '2026-10-10',
};

// Yerel saatle kurulur: ekran anı yerel saatle gösterir, test saat dilimine bağlı kalmasın.
const an = (gun: number, saat: number, dakika = 0) => new Date(2026, 9, gun, saat, dakika).toISOString();

const MESAI: GunlukMesaiCevabi = {
  tarih: '2026-10-10',
  satirlar: [
    { kisiId: 7, ad: 'Deneme Gündüzcü', isMerkeziId: 10, vardiyaId: 1,
      plan: { dakika: 450, kapali: null, araliklar: [{ baslangic: an(10, 8), bitis: an(10, 12) }, { baslangic: an(10, 12, 30), bitis: an(10, 16) }] } },
    { kisiId: 8, ad: 'Deneme Gececi', isMerkeziId: 10, vardiyaId: 2,
      plan: { dakika: 480, kapali: null, araliklar: [{ baslangic: an(10, 22), bitis: an(11, 6) }] } },
    { kisiId: 9, ad: 'Deneme Seçmeyen', isMerkeziId: 10, vardiyaId: null, plan: { dakika: 0, kapali: null, araliklar: [] } },
    { kisiId: 11, ad: 'Deneme Bağsız', isMerkeziId: null, vardiyaId: null, plan: null },
  ],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(mesai: (tarih: string) => Response = (tarih) => json(200, { ...MESAI, tarih })) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.mesai', 'sayfa.vardiya', 'sayfa.istasyonlar'] } } satisfies OturumCevabi);
    if (yol === '/vardiya-takvimi') return json(200, TAKVIM);
    if (yol.startsWith('/gunluk-mesai?tarih=')) return mesai(yol.slice('/gunluk-mesai?tarih='.length));
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><MemoryRouter><GunlukMesaiEkrani /></MemoryRouter></QueryClientProvider>);
}

const satir = (ad: string) => screen.getByText(ad).closest('tr')!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Günlük mesai', () => {
  it('sunucunun bugününü açar; kişi, vardiya, plan giriş-çıkış ve net mesai satırda; gece vardiyası ertesi sabah biter', async () => {
    const yollar = sunucuKur();
    ac();
    await screen.findByText('Deneme Gündüzcü');
    expect(yollar).toContain('/gunluk-mesai?tarih=2026-10-10');
    expect(screen.getByRole('heading', { name: /10\.10\.2026 Cmt/ })).toBeTruthy();
    const g = within(satir('Deneme Gündüzcü'));
    for (const metin of ['IM-A Deneme A', 'Gündüz', '08:00', '16:00', '7,5 sa', 'Mesaide']) expect(g.getByText(metin)).toBeTruthy();
    const gece = within(satir('Deneme Gececi'));
    for (const metin of ['22:00', '11.10 06:00', '8 sa']) expect(gece.getByText(metin)).toBeTruthy();
    expect(within(satir('Deneme Seçmeyen')).getByText('Seçilmedi')).toBeTruthy();
    expect(within(satir('Deneme Seçmeyen')).getByText('Vardiya yok')).toBeTruthy();
    expect(within(satir('Deneme Bağsız')).getByText('İş merkezi yok')).toBeTruthy();
  });

  it('özet: mesaide olan, planlı saat, vardiyası seçilmemiş ve iş merkezi olmayan kişi sayısı', async () => {
    sunucuKur();
    ac();
    await screen.findByText('Deneme Gündüzcü');
    const kart = (baslik: string) => [...document.querySelectorAll('.tc-vr-ozet .tc-sayi-karti')].find((k) => k.querySelector('.tc-sayi-baslik')?.textContent === baslik)!;
    const deger = (baslik: string) => kart(baslik).querySelector('.tc-sayi-deger')!.textContent;
    expect(deger('Mesaide')).toBe('2');
    expect(deger('Planlı mesai')).toBe('15,5');
    expect(deger('Vardiyası seçilmemiş')).toBe('2');
    expect(deger('İş merkezi yok')).toBe('1');
    expect(kart('Vardiyası seçilmemiş').getAttribute('href')).toBe('/vardiya/personel');
    expect(screen.getByText(/Gerçek giriş-çıkış kaydı henüz tutulmuyor/)).toBeTruthy();
  });

  it('gün değişince o günü okur; tatil günü uyarı verir; Bugün düğmesi geri döner', async () => {
    const yollar = sunucuKur();
    ac();
    await screen.findByText('Deneme Gündüzcü');
    const bugun = screen.getByRole('button', { name: 'Bugün' }) as HTMLButtonElement;
    expect(bugun.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki gün' }));
    await screen.findByRole('heading', { name: /11\.10\.2026 Paz/ });
    expect(yollar).toContain('/gunluk-mesai?tarih=2026-10-11');
    fireEvent.change(screen.getByLabelText('Gün'), { target: { value: '29.10.2026' } });
    fireEvent.blur(screen.getByLabelText('Gün'));
    expect(await screen.findByText(/Cumhuriyet Bayramı: bu gün vardiya çalışmaz/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bugün' }));
    await screen.findByRole('heading', { name: /10\.10\.2026/ });
  });

  it('personel yoksa anlamlı boş durum; okuma hatasında yeniden dene', async () => {
    sunucuKur(() => json(200, { tarih: '2026-10-10', satirlar: [] }));
    ac();
    expect(await screen.findByText(/İstasyona atanmış personel yok/)).toBeTruthy();
    expect(screen.getAllByText('Veri yok')).toHaveLength(4);
    expect(screen.queryByText('0')).toBeNull();
    await waitFor(() => expect(screen.getByRole('link', { name: 'İstasyonlar' }).getAttribute('href')).toBe('/istasyonlar'));
    expect(screen.getByRole('link', { name: 'Vardiya başına personel' }).getAttribute('href')).toBe('/vardiya/personel');
    cleanup();
    sunucuKur(() => json(500, { kod: 'SUNUCU', mesaj: 'Hata' }));
    ac();
    expect(await screen.findByRole('button', { name: /Yeniden dene|Yenile/ })).toBeTruthy();
  });
});
