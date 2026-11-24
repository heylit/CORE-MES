import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { TeklifSurumFarki } from './TeklifSurumFarki.tsx';
import { TeklifSurumu } from './TeklifSurumu.tsx';

// Cevaplar uydurmadır (ORN-).
const SURUM1 = {
  surumNo: 1, iskontoOrani: '0.00', teslimGun: 30, terminTarihi: null, odemeKosulu: '30 gün', gecerlilik: '2026-11-20', aciklama: null, olusturma: '2026-11-12T10:20:00+03:00',
  fiyatlar: [{ satirId: 11, birimFiyat: '120.0000', iskontoluFiyat: '120.0000', tutar: '24000.00' }], toplam: '24000.00',
  kdvOrani: '20.00', kdvTutari: '4800.00', genelToplam: '28800.00', iskontoOnaylayan: null, iskontoOnayAni: null,
} satisfies TeklifAyrintiCevabi['surumler'][number];
const SURUM2 = {
  ...SURUM1, surumNo: 2, iskontoOrani: '5.00', teslimGun: 25,
  fiyatlar: [{ satirId: 11, birimFiyat: '118.0000', iskontoluFiyat: '112.1000', tutar: '22420.00' }], toplam: '22420.00', kdvTutari: '4484.00', genelToplam: '26904.00',
} satisfies TeklifAyrintiCevabi['surumler'][number];
const TEKLIF = {
  id: 21, no: 'TK-2026-0021', durum: 'verildi', firmaId: 7, firmaAd: 'ORN-Firma A', firmaKodu: null, baslik: 'ORN-Teklif', paraBirimi: 'TRY', istenenTarih: null, aciklama: null, not: null,
  kabulSurumu: null, siparisId: null, siparisteSurumNo: null, sonSurumNo: 2, olusturma: '2026-11-11T09:00:00+03:00', guncelleme: null, surum: 4, olusturanId: 3, arsiv: null,
  satirlar: [{ id: 11, sira: 1, malzemeNo: null, malzemeKodu: null, malzemeAdi: null, aciklamalar: [], tanim: 'ORN-Mil 40', birim: 'adet', miktar: '200.000', yerlilikOrani: null }],
  surumler: [SURUM1, SURUM2], kdvSecenekleri: { oranlar: ['20.00'], genel: '20.00' },
} satisfies TeklifAyrintiCevabi;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function ciz(islemler: string[], surum = SURUM2, onceki: typeof SURUM1 | null = SURUM1) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    istekler.push(adres.replace('/api', ''));
    if (adres.endsWith('/oturum')) return new Response(JSON.stringify({ kullanici: { id: 7, ad: 'ORN-Kullanici', islemler } }), { status: 200 });
    return new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'yok' }), { status: 404 });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TeklifSurumFarki teklif={TEKLIF} surum={surum} onceki={onceki} />
    </QueryClientProvider>,
  );
  return istekler;
}

describe('Teklif sürüm geçmişinde fark (3635)', () => {
  it('fiyatı görende satırda özet çıkar; düğme farkı pencerede açar (eski → yeni, yüzde, genel toplam)', async () => {
    const istekler = ciz(['siparisler.oku', 'siparisler.fiyat-oku']);
    expect(await screen.findByText('1 kalemde fiyat')).toBeTruthy();
    expect(screen.getByText('İskonto')).toBeTruthy();
    expect(screen.getByText('Teslim süresi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sürüm 1 ile farkı göster' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText('ORN-Mil 40')).toBeTruthy();
    expect(pencere.textContent).toMatch(/120,00 TRY → 118,00 TRY/);
    expect(pencere.textContent).toMatch(/30 gün → 25 gün/);
    expect(pencere.textContent).toMatch(/%0 → %5/);
    expect(pencere.textContent).toMatch(/28\.800,00 TRY → 26\.904,00 TRY/);
    expect(istekler.filter((i) => i !== '/oturum')).toEqual([]);
  });

  it('fiyatı görmeyende fiyat, iskonto ve toplam farkı ne özette ne pencerede çıkar; KDV oranı ve koşul farkı çıkar; ek istek yok', async () => {
    const istekler = ciz(['siparisler.oku'], { ...SURUM2, kdvOrani: '10.00' });
    await waitFor(() => expect(istekler).toContain('/oturum'));
    await new Promise((coz) => setTimeout(coz, 30));
    expect(screen.getByText('Teslim süresi')).toBeTruthy();
    expect(screen.getByText('KDV oranı')).toBeTruthy();
    expect(screen.queryByText('İskonto')).toBeNull();
    expect(screen.queryByText(/kalemde fiyat/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sürüm 1 ile farkı göster' }));
    const pencere = await screen.findByRole('dialog');
    expect(pencere.textContent).toMatch(/30 gün → 25 gün/);
    expect(pencere.textContent).toMatch(/%20 → %10/);
    expect(pencere.textContent).not.toMatch(/TRY|118|120|%5|ORN-Mil|Kalem birim|Genel toplam/);
    expect(istekler.filter((i) => i !== '/oturum')).toEqual([]);
  });

  it('ilk sürümde "İlk sürüm", fark yoksa "ile aynı" yazar; düğme çizilmez', async () => {
    ciz(['siparisler.fiyat-oku'], SURUM1, null);
    expect(await screen.findByText('İlk sürüm')).toBeTruthy();
    cleanup();
    ciz(['siparisler.fiyat-oku'], { ...SURUM1, surumNo: 2 }, SURUM1);
    expect(await screen.findByText('Sürüm 1 ile aynı')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fiyat görmeyende yalnız fiyat ya da iskonto değiştiyse "Koşullarda fark yok" yazar', async () => {
    const istekler = ciz(['siparisler.oku'], { ...SURUM1, surumNo: 2, iskontoOrani: '5.00', fiyatlar: [{ satirId: 11, birimFiyat: '118.0000', iskontoluFiyat: '112.1000', tutar: '22420.00' }] }, SURUM1);
    await waitFor(() => expect(istekler).toContain('/oturum'));
    await new Promise((coz) => setTimeout(coz, 30));
    expect(screen.getByText('Koşullarda fark yok')).toBeTruthy();
    expect(screen.queryByText(/ile aynı/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('teklif föyünde KDV oranı fiyat görmeyene de görünür; KDV tutarı ve toplam görünmez', async () => {
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      istekler.push(adres);
      return new Response(JSON.stringify({ kullanici: { id: 7, ad: 'ORN-Kullanici', islemler: ['siparisler.oku'] } }), { status: 200 });
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeklifSurumu teklif={TEKLIF} surum={{ ...SURUM2, iskontoOrani: null, toplam: null, kdvTutari: null, genelToplam: null }} kabul={false} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(istekler.length).toBeGreaterThan(0));
    await new Promise((coz) => setTimeout(coz, 30));
    expect(screen.getByText('KDV oranı')).toBeTruthy();
    expect(screen.getByText('%20')).toBeTruthy();
    expect(screen.queryByText(/Genel toplam|Toplam \(KDV hariç\)/)).toBeNull();
  });
});
