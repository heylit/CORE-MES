import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tezgah bağlantısı (deneme)', () => {
  it('farklı tezgahlar adıyla yazılır; fark olan hücre işaretlenir; SmartES’te olmayan ve eski okuma kelimeyle söylenir', async () => {
    sunucuKur(ORNEK_DURUM());
    ac(<Karsilastirma />);
    const satir = (await screen.findByRole('rowheader', { name: /ORN-T04/ })).closest('tr') as HTMLElement;
    expect(screen.getByText(/SmartES’ten farklı: ORN-T04 · SmartES’te karşılığı yok: ORN-T06/)).toBeTruthy();
    expect(within(satir).getAllByText('(farklı)')).toHaveLength(2);
    expect(within(satir).getByText(/SmartES: Çalışıyor/)).toBeTruthy();
    const ilk = screen.getByRole('rowheader', { name: /ORN-T01/ }).closest('tr') as HTMLElement;
    expect(within(ilk).queryByText('(farklı)')).toBeNull();
    expect(within(ilk).getByText('SmartES: %41')).toBeTruthy();
    expect(within(screen.getByRole('rowheader', { name: /ORN-T06/ }).closest('tr') as HTMLElement).getByText('SmartES’te yok')).toBeTruthy();
    expect(within(screen.getByRole('rowheader', { name: /ORN-T09/ }).closest('tr') as HTMLElement).getByText('eski okuma')).toBeTruthy();
    expect(screen.getAllByText('MOTION_PROGRAM: ORN hata').length).toBeGreaterThan(0);
    expect(screen.getByText('5 tezgah · 4 bağlı', { exact: false })).toBeTruthy();
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
    sunucuKur({ ...ORNEK_DURUM(), sonHata: 'Tezgah servisi süresinde cevap vermedi.' });
    ac(<Karsilastirma />);
    expect((await screen.findByRole('alert')).textContent).toContain('Tezgah servisi süresinde cevap vermedi.');
  });

  it('ayrıntı ilk tezgahı açar; seçilen tezgahın öğeleri geldiği adla listelenir', async () => {
    const yollar = sunucuKur(ORNEK_DURUM());
    ac(<TezgahAyrintisi />);
    expect(await screen.findByText('Execution')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ORN-T01/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /ORN-T05/ }));
    await screen.findByRole('region', { name: 'ORN-T05' });
    expect(yollar).toContain('/tezgah-baglantisi/tezgahlar/ORN-T05');
  });
});
