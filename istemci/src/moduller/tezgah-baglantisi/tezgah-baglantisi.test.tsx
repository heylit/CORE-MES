import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ORNEK_AYRINTI, ORNEK_DURUM } from './fikstur.ts';
import { Karsilastirma } from './Karsilastirma.tsx';
import { TezgahAyrintisi } from './TezgahAyrintisi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(durum: TezgahBaglantisiDurumCevabi): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/tezgah-baglantisi/durum') return json(200, durum);
    if (yol.startsWith('/tezgah-baglantisi/tezgahlar/')) return json(200, { ...ORNEK_AYRINTI(), cihazAdi: decodeURIComponent(yol.split('/').pop() ?? '') });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function ac(ekran: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tezgâh bağlantısı (deneme)', () => {
  it('farklı tezgahlar adıyla yazılır; fark olan hücre işaretlenir; SmartES’te olmayan ve eski okuma kelimeyle söylenir', async () => {
    sunucuKur(ORNEK_DURUM());
    ac(<Karsilastirma />);
    const satir = (await screen.findByRole('rowheader', { name: /ORN-T04/ })).closest('tr') as HTMLElement;
    expect(screen.getByText(/SmartES’ten farklı: ORN-T04 · SmartES’te karşılığı yok: ORN-T06/)).toBeTruthy();
    expect(within(satir).getAllByText('≠ fark')).toHaveLength(2);
    expect(within(satir).getByText(/SmartES: Çalışıyor/)).toBeTruthy();
    const ilk = screen.getByRole('rowheader', { name: /ORN-T01/ }).closest('tr') as HTMLElement;
    expect(within(ilk).queryByText('≠ fark')).toBeNull();
    expect(within(ilk).getByText('SmartES: %41')).toBeTruthy();
    expect(within(screen.getByRole('rowheader', { name: /ORN-T06/ }).closest('tr') as HTMLElement).getByText('SmartES’te kayıt yok')).toBeTruthy();
    expect(within(screen.getByRole('rowheader', { name: /ORN-T09/ }).closest('tr') as HTMLElement).getByText('eski okuma')).toBeTruthy();
    expect(screen.getAllByText('MOTION_PROGRAM: ORN hata').length).toBeGreaterThan(0);
    expect(screen.getByText('5 tezgâh · 4 bağlı · 1 alarm · 1 fark · 1 eski ya da bağlantısız')).toBeTruthy();
    // Sorunlu tezgâhlar üstte: alarm, fark, eski; sonra sağlıklılar.
    expect(screen.getAllByRole('rowheader').map((r) => r.textContent)).toEqual(['ORN-T05Elle veri girişi', 'ORN-T04Otomatik', 'ORN-T09', 'ORN-T01Otomatik', 'ORN-T06Otomatik']);
    expect(screen.getAllByRole('link', { name: 'ORN-T04 ayrıntısı' })[0]?.getAttribute('href')).toBe('/tezgah-baglantisi/ayrinti?tezgah=ORN-T04');
  });

  it('okuma kapalıyken ve adres yokken nedenini söyler; son hata gösterilir', async () => {
    sunucuKur({ ...ORNEK_DURUM(), baglanti: 'kapali', tezgahlar: [], sonOkuma: null });
    ac(<Karsilastirma />);
    expect(await screen.findByText(/Okuma kapalı\. Sistem Ayarları/)).toBeTruthy();
    cleanup();
    sunucuKur({ ...ORNEK_DURUM(), baglanti: 'adres-yok', tezgahlar: [] });
    ac(<Karsilastirma />);
    expect(await screen.findByText(/TMIV2_TEZGAH_MTCONNECT_ADRESI/)).toBeTruthy();
    cleanup();
    sunucuKur({ ...ORNEK_DURUM(), sonHata: 'Tezgâh servisi süresinde cevap vermedi.' });
    ac(<Karsilastirma />);
    expect((await screen.findByRole('alert')).textContent).toContain('Tezgâh servisi süresinde cevap vermedi.');
  });

  it('ayrıntı ilk tezgahı açar; alanlar bileşene göre gruplanır, birim ve son değişme yazılır; sayısal alanda eğri vardır', async () => {
    const yollar = sunucuKur(ORNEK_DURUM());
    ac(<TezgahAyrintisi />);
    expect(await screen.findByRole('group', { name: 'Denetleyici' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ORN-T05/ }).getAttribute('aria-pressed')).toBe('true');
    const donel = screen.getByRole('group', { name: 'Dönel eksen · S' });
    expect(within(donel).getByText('İş mili hızı').getAttribute('title')).toBe('SpindleSpeed');
    expect(within(donel).getByText('2.350 dev/dk')).toBeTruthy();
    expect(within(donel).getByText('42 %')).toBeTruthy();
    expect(within(donel).getAllByRole('img', { name: /Son bir saatin eğrisi, 5 nokta/ })).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Doğrusal eksen · X' })).getByText('11,5 %')).toBeTruthy();
    // Yalnız metin olan alanın eğrisi yoktur; değişme zamanı yazılır.
    const kontrol = screen.getByRole('group', { name: 'Denetleyici' });
    expect(within(kontrol).getByText('O1204')).toBeTruthy();
    expect(within(kontrol).getAllByText(/^Değişti /).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /ORN-T01/ }));
    await screen.findByRole('region', { name: 'ORN-T01' });
    expect(yollar).toContain('/tezgah-baglantisi/tezgahlar/ORN-T01');
  });

  it('koşullar başlangıç ve bitişiyle, takımlar ömür sınırlarıyla, veri boşlukları zaman çizgisinde gösterilir', async () => {
    sunucuKur(ORNEK_DURUM());
    ac(<TezgahAyrintisi />);
    const kosullar = await screen.findByRole('list', { name: 'Koşul kayıtları' });
    expect(within(kosullar).getByText('Hata')).toBeTruthy();
    expect(within(kosullar).getByText('Normal')).toBeTruthy();
    expect(within(kosullar).getByText(/sürüyor/)).toBeTruthy();
    expect(within(kosullar).getByText('ORN hata')).toBeTruthy();
    const takimlar = screen.getByRole('list', { name: 'Takımlar' });
    expect(within(takimlar).getByText('Takım 7')).toBeTruthy();
    expect(within(takimlar).getByText(/Süre kalan: 85 dk/)).toBeTruthy();
    expect(within(takimlar).getByText(/başlangıç 120 dk · uyarı 10 dk/)).toBeTruthy();
    expect(within(takimlar).queryByText(/sınır/i)).toBeNull();
    expect(within(takimlar).getByText('Ömür verisi yok')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Son bir saatte 1 veri boşluğu' })).toBeTruthy();
    const bosluklar = screen.getByRole('list', { name: 'Veri boşlukları' });
    expect(within(bosluklar).getByText(/Servis tamponundan düştü/)).toBeTruthy();
    expect(screen.getByText(/Son bir saatte 1, son 24 saatte 2 veri boşluğu/)).toBeTruthy();
    expect(within(bosluklar).getByText(/Servis yeniden başladı/)).toBeTruthy();
  });

  it('servis takım vermiyorsa ekran "Veri yok" yazar', async () => {
    const a = { ...ORNEK_AYRINTI(), varliklar: [], varlikDurumu: 'yok' as const };
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => (adres.endsWith('/durum') ? json(200, ORNEK_DURUM()) : json(200, a))));
    ac(<TezgahAyrintisi />);
    expect(await screen.findByText(/Veri yok: servis takım verisi/)).toBeTruthy();
  });

  it('canlı gösterge: son okumanın yaşı yazılır; iki turdan eskiyse "Eski okuma"; sayfa aralıkta yenilenir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const yollar = sunucuKur({ ...ORNEK_DURUM(), sonOkuma: new Date(Date.now() - 3000).toISOString() });
      ac(<Karsilastirma />);
      expect(await screen.findByText(/Son okuma [3-4] sn önce/)).toBeTruthy();
      expect(screen.queryByText('Eski okuma')).toBeNull();
      await vi.advanceTimersByTimeAsync(11_000);
      expect(await screen.findByText('Eski okuma')).toBeTruthy();
      // 5 saniyelik aralıkta en az iki kez daha yenilendi.
      expect(yollar.filter((y) => y === '/tezgah-baglantisi/durum').length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sekme görünmüyorken yenileme ve yaş sayacı durur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gorunur = vi.spyOn(document, 'visibilityState', 'get');
    try {
      const yollar = sunucuKur(ORNEK_DURUM());
      ac(<Karsilastirma />);
      await screen.findAllByText(/son okuma/i);
      gorunur.mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      const once = yollar.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(yollar.length).toBe(once);
    } finally {
      gorunur.mockRestore();
      vi.useRealTimers();
    }
  });
});
