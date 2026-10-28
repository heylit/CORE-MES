import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { TakvimCevabi, TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { Takvim, TakvimKanban, TakvimTablo } from './Takvim.tsx';

// Bugün 2031-03-12 çarşamba (tesis saati); biçim sunucunun cevabından (takvim.test.ts).
const kayit = (o: Partial<TakvimKaydi>): TakvimKaydi => ({
  kaynak: 'siparis', kimlik: '1', tarih: '2031-03-12', no: 'S-1', baslik: 'Sipariş S-1', ilgili: 'Deneme firma', durum: 'Onaylı', bitti: false, ...o,
});
const CEVAP: TakvimCevabi = {
  kaynaklar: ['siparis', 'vergi', 'planli-durus'],
  bekleyenler: ['sevk'],
  kayitlar: [
    kayit({ kimlik: '7', tarih: '2031-03-05', no: 'S-7', baslik: 'Sipariş S-7' }),
    kayit({}),
    kayit({ kaynak: 'vergi', kimlik: '2031-03-28-kdv', tarih: '2031-03-28', no: null, baslik: 'KDV beyannamesi', ilgili: 'Dönem: Şubat 2031', durum: 'Son gün' }),
    kayit({ kaynak: 'planli-durus', kimlik: '3', tarih: '2031-03-02', no: null, baslik: 'Planlı bakım', ilgili: 'Bütün atölye', durum: 'Geçti', bitti: true }),
  ],
  tatiller: [{ tarih: '2031-03-20', ad: 'Deneme tatili' }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response = () => json(200, CEVAP)) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/takvim?')) return yanit();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir(ekran: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><MemoryRouter>{ekran}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2031-03-12T09:00:00Z')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Takvim ekranı', () => {
  it('özet geciken ve bugünü sayar; ay görünümü ızgara aralığını okur, tatili ve bağlanmayan kaynağı gösterir', async () => {
    const yollar = sunucuKur();
    cizdir(<Takvim />);
    const ozet = await screen.findByRole('group', { name: 'Özet' });
    expect(within(within(ozet).getByText('Geciken').closest('button')!).getByText('1')).toBeTruthy();
    expect(within(within(ozet).getByText('Bugün').closest('button')!).getByText('1')).toBeTruthy();
    expect(yollar).toContain('/takvim?baslangic=2031-01-10&bitis=2031-04-12');
    expect(await screen.findByText('Deneme tatili')).toBeTruthy();
    expect(yollar).toContain('/takvim?baslangic=2031-02-24&bitis=2031-04-06');
    expect(screen.getByText('1 kaynak henüz bağlanmadı')).toBeTruthy();
    expect(screen.getByText('Mart 2031')).toBeTruthy();
  });

  it('özet kartı gündeme geçer ve süzer; kaynak düğmesi kaynağı gizler', async () => {
    sunucuKur();
    cizdir(<Takvim />);
    fireEvent.click(within(await screen.findByRole('group', { name: 'Özet' })).getByText('Geciken'));
    expect(screen.getByText('Sipariş S-7')).toBeTruthy();
    expect(screen.queryByText('KDV beyannamesi')).toBeNull();
    fireEvent.click(screen.getByText('Özet süzgecini kaldır'));
    expect(screen.getByText('KDV beyannamesi')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Kaynaklar' })).getByText('Vergi beyanı'));
    expect(screen.queryByText('KDV beyannamesi')).toBeNull();
  });

  it('kayda basınca ayrıntı açılır; takvim tarihi değiştirmez', async () => {
    sunucuKur();
    cizdir(<Takvim />);
    fireEvent.click(within(await screen.findByRole('group', { name: 'Özet' })).getByText('Bugün'));
    fireEvent.click(screen.getByText('Sipariş S-1'));
    const pencere = await screen.findByRole('dialog', { name: 'Sipariş S-1' });
    expect(within(pencere).getByText('Siparişler ekranında aç')).toBeTruthy();
    expect(within(pencere).getByText(/Takvim tarihi değiştirmez/)).toBeTruthy();
  });

  it('tablo bitenleri gizler, istenince gösterir; kanban zamana göre gruplar', async () => {
    sunucuKur();
    cizdir(<TakvimTablo />);
    const tablo = await screen.findByRole('table', { name: 'Takvim kayıtları' });
    expect(within(tablo).queryByText('Planlı bakım')).toBeNull();
    fireEvent.click(screen.getByLabelText('Bitenleri göster'));
    expect(within(screen.getByRole('table', { name: 'Takvim kayıtları' })).getByText('Planlı bakım')).toBeTruthy();
    cleanup();
    sunucuKur();
    cizdir(<TakvimKanban />);
    const gec = await screen.findByRole('region', { name: 'Geciken' });
    expect(within(gec).getByText('Sipariş S-7')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Sonra' })).getByText('KDV beyannamesi')).toBeTruthy();
  });

  it('okuma hatasında yeniden dene gösterir', async () => {
    sunucuKur(() => json(500, { kod: 'SUNUCU', mesaj: 'Hata.' }));
    cizdir(<Takvim />);
    expect(await screen.findByRole('button', { name: /yeniden|Tekrar/i })).toBeTruthy();
  });
});
