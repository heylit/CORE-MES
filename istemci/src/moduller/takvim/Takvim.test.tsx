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

// Pencere 2031-01-10'da başlar: S-1 pencerede de olduğu için ikinci kez sayılmamalı, S-90 yalnız bu okumadan gelir.
const ESKI_GECIKENLER = { kayitlar: [kayit({ kimlik: '90', tarih: '2030-11-20', no: 'S-90', baslik: 'Sipariş S-90' }), kayit({ kimlik: '7', tarih: '2031-03-05', no: 'S-7', baslik: 'Sipariş S-7' })] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yanit: () => Response = () => json(200, CEVAP), gecikenler: unknown = { kayitlar: [] }) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol.startsWith('/takvim?')) return yanit();
    if (yol === '/takvim/gecikenler') return json(200, gecikenler);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir(ekran: React.ReactNode, adres = '/takvim') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><MemoryRouter initialEntries={[adres]}>{ekran}</MemoryRouter></QueryClientProvider>);
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

  it('pencereden eski geciken kayıt (1816) özette, gündemde ve kanbanda sayılır; pencerede olan iki kez sayılmaz', async () => {
    const yollar = sunucuKur(undefined, ESKI_GECIKENLER);
    cizdir(<Takvim />);
    const ozet = await screen.findByRole('group', { name: 'Özet' });
    expect(within(within(ozet).getByText('Geciken').closest('button')!).getByText('2')).toBeTruthy();
    expect(yollar).toContain('/takvim/gecikenler');
    fireEvent.click(within(ozet).getByText('Geciken'));
    expect(screen.getByText('Sipariş S-90')).toBeTruthy();
    expect(screen.getAllByText('Sipariş S-7')).toHaveLength(1);
    cleanup();
    sunucuKur(undefined, ESKI_GECIKENLER);
    cizdir(<TakvimKanban />);
    const gec = await screen.findByRole('region', { name: 'Geciken' });
    expect(within(gec).getByText('Sipariş S-90')).toBeTruthy();
  });

  it('çok günlük izin (1816) ızgarada her gününde görünür; süren izin gecikmiş değil, bugündedir', async () => {
    const izin = (o: Partial<TakvimKaydi>) => kayit({ kaynak: 'izin', no: null, ilgili: 'Deneme Kişi', durum: 'Onaylandı', ...o });
    sunucuKur(() => json(200, {
      ...CEVAP, kaynaklar: ['izin'], bekleyenler: [],
      kayitlar: [
        izin({ kimlik: 'leave_uc', tarih: '2031-03-17', bitis: '2031-03-19', baslik: 'Yıllık izin (3 gün)' }),
        izin({ kimlik: 'leave_suren', tarih: '2031-03-10', bitis: '2031-03-13', baslik: 'Mazeret izni (4 gün)' }),
      ],
    }));
    cizdir(<Takvim />);
    expect(await screen.findByText('Mart 2031')).toBeTruthy();
    for (const g of ['17 Mar Pzt', '18 Mar Sal', '19 Mar Çar']) {
      expect(within(screen.getByLabelText(g)).getByText(/Deneme Kişi/)).toBeTruthy();
    }
    expect(within(screen.getByLabelText('20 Mar Per')).queryByText(/Deneme Kişi/)).toBeNull();
    const ozet = screen.getByRole('group', { name: 'Özet' });
    expect(within(within(ozet).getByText('Geciken').closest('button')!).getByText('0')).toBeTruthy();
    expect(within(within(ozet).getByText('Bugün').closest('button')!).getByText('1')).toBeTruthy();
    fireEvent.click(screen.getAllByText(/Mazeret izni|Deneme Kişi/)[0]!);
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText('Sürüyor')).toBeTruthy();
  });

  it('TKV-4: kip ve dönem adresten açılır; kaynak sayısı yalnız açık kayıtları sayar; arama Türkçe harfi yok sayar', async () => {
    const yollar = sunucuKur(() => json(200, { ...CEVAP, kayitlar: [...CEVAP.kayitlar, kayit({ kimlik: '8', tarih: '2031-03-14', no: 'S-8', baslik: 'Sipariş S-8', ilgili: 'Çağrı Şirketi' })] }));
    cizdir(<Takvim />, '/takvim?kip=hafta&donem=2031-04-09');
    expect(await screen.findByText('7 Nis – 13 Nis')).toBeTruthy();
    expect(yollar).toContain('/takvim?baslangic=2031-04-07&bitis=2031-04-13');
    const kaynaklar = screen.getByRole('group', { name: 'Kaynaklar' });
    expect(within(within(kaynaklar).getByText('Planlı duruş').closest('button')!).getByText('0')).toBeTruthy();
    fireEvent.click(screen.getByText('Gündem'));
    fireEvent.change(screen.getByPlaceholderText('No, firma, kişi ara'), { target: { value: 'CAGRI sirketi' } });
    expect(screen.getByText('Sipariş S-8')).toBeTruthy();
    expect(screen.queryByText('Sipariş S-1')).toBeNull();
  });

  it('TKV-4: tablo metni Türkçe harf ve sayı sırasıyla dizer', async () => {
    sunucuKur(() => json(200, { ...CEVAP, kaynaklar: ['siparis'], kayitlar: [
      kayit({ kimlik: '10', no: 'S-10', baslik: 'Sipariş S-10', ilgili: 'Zeta' }),
      kayit({ kimlik: '9', no: 'S-9', baslik: 'Sipariş S-9', ilgili: 'Çınar' }),
      kayit({ kimlik: '11', no: 'S-11', baslik: 'Sipariş S-11', ilgili: 'Can' }),
    ] }));
    cizdir(<TakvimTablo />, '/takvim/tablo');
    await screen.findByRole('table', { name: 'Takvim kayıtları' });
    fireEvent.click(screen.getByRole('button', { name: /İlgili/ }));
    const ilgili = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[3]!.textContent);
    expect(ilgili()).toEqual(['Can', 'Çınar', 'Zeta']);
    fireEvent.click(screen.getByRole('button', { name: /Kayıt/ }));
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2]!.textContent)).toEqual(['Sipariş S-9', 'Sipariş S-10', 'Sipariş S-11']);
  });
});
