import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { FinansOzetiCevabi } from '#paylasilan/sozlesme/finans.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const BOS = { sayi: 0, tutarTl: '0.00' };
const ozetGovdesi = (ek: Partial<FinansOzetiCevabi>): FinansOzetiCevabi =>
  ({ kurlar: [], gecikenTahsilat: BOS, yaklasanOdeme: BOS, yaklasanSiparis: { sayi: 0, tutarTl: '0.00' }, portfoyCek: BOS, nakitTl: null, alacakTl: '0.00', borcTl: '0.00', aylikKarTl: '0.00', ...ek });

// Kişi ve kurlar uydurmadır.
function sunucuKur(islemler: string[], ozet: () => Response, diger: Record<string, () => Response> = {}) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Muhasebe', islemler } });
    if (yol === '/finans/ozet') return ozet();
    const isle = diger[yol.split('?')[0]!];
    if (isle) return isle();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function panoyuAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Finans pano kartları', () => {
  it('iki kur kartı tek istekle dolar; kuru olmayan döviz "Veri yok" der, sıfır uydurmaz', async () => {
    const istekler = sunucuKur(['sayfa.finans', 'finans.oku', 'finans.yonet'], () =>
      json(200, ozetGovdesi({ kurlar: [{ paraBirimi: 'USD', kur: '33.750000', tarih: '2026-10-09' }] })));
    panoyuAc();
    await screen.findByText('33,75');
    expect(kart('USD kuru').textContent).toContain('1 USD, 09.10.2026 kuru');
    expect(kart('EUR kuru').textContent).toContain('Veri yok');
    expect(kart('EUR kuru').textContent).toContain('Finansta kur girilmemiş');
    expect(istekler.filter((y) => y === '/finans/ozet')).toHaveLength(1);
    await vi.waitFor(() => expect(kart('USD kuru').getAttribute('href')).toBe('/finans/ayarlar'));
  });

  it('kur listesini açamayan okuyucu finans ana sayfasına gider; uç hata verirse "Alınamadı"', async () => {
    sunucuKur(['sayfa.finans', 'finans.oku'], () => json(200, ozetGovdesi({ kurlar: [{ paraBirimi: 'EUR', kur: '36.100000', tarih: '2026-10-08' }] })));
    panoyuAc();
    await screen.findByText('36,1');
    await vi.waitFor(() => expect(kart('EUR kuru').getAttribute('href')).toBe('/finans'));
    cleanup();
    sunucuKur(['finans.oku'], () => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    panoyuAc();
    await vi.waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(anaSayfaKartlari.length));
    expect(kart('USD kuru').getAttribute('href')).toBeNull();
  });

  it('rakam kartları: sayı ve TL toplamı; nakit yoksa "Veri yok"; sayfayı açamayana bağlantı yok', async () => {
    sunucuKur(['sayfa.finans', 'finans.oku'], () => json(200, ozetGovdesi({
      gecikenTahsilat: { sayi: 3, tutarTl: '12345.50' }, yaklasanOdeme: { sayi: 2, tutarTl: '800.00' }, portfoyCek: { sayi: 4, tutarTl: '600.00' }, nakitTl: '98765.40',
    })));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Nakit (TL)').textContent).toContain('98.765'));
    expect(kart('Vadesi geçmiş tahsilat').textContent).toContain('Toplam 12.345,50 TL');
    expect(kart('Vadesi geçmiş tahsilat').getAttribute('data-ton')).toBe('uyari');
    expect(kart('7 gün içinde ödeme').textContent).toContain('Toplam 800,00 TL');
    expect(kart('7 gün içinde ödeme').textContent).not.toContain('siparişten');
    expect(kart('Portföydeki çek ve senet').textContent).toContain('4');
    await vi.waitFor(() => expect(kart('Nakit (TL)').getAttribute('href')).toBe('/finans/nakit'));
    expect(kart('Portföydeki çek ve senet').getAttribute('href')).toBe('/finans/cekler');
    cleanup();
    sunucuKur(['finans.oku'], () => json(200, ozetGovdesi({})));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Nakit (TL)').textContent).toContain('Veri yok'));
    expect(kart('Nakit (TL)').textContent).toContain('Hesap ya da döviz kuru eksik');
    expect(kart('Vadesi geçmiş tahsilat').getAttribute('href')).toBeNull();
  });

  it('kartlar finans.oku ile görünür; geciken tahsilat uyarıda, yaklaşan ödeme işlerde', () => {
    for (const k of anaSayfaKartlari) expect(k.islem).toBe('finans.oku');
    const bolum = Object.fromEntries(anaSayfaKartlari.map((k) => [k.anahtar, k.bolum]));
    expect(bolum).toMatchObject({ 'finans-geciken-tahsilat': 'uyari', 'finans-yaklasan-odeme': 'is', 'finans-nakit': 'ozet', 'finans-portfoy-cek': 'ozet' });
  });

  it('yönetici şirket özeti: dört rakam yönetim bölümünde, finans.oku ile (#1085); kâr eksi olabilir, nakit yoksa "Veri yok"', async () => {
    const k = Object.fromEntries(anaSayfaKartlari.map((x) => [x.anahtar, x]));
    for (const a of ['finans-yonetim-nakit', 'finans-yonetim-alacak', 'finans-yonetim-borc', 'finans-yonetim-kar']) expect(k[a]).toMatchObject({ bolum: 'yonetim', islem: 'finans.oku' });
    sunucuKur(['sayfa.finans', 'finans.oku'], () => json(200, ozetGovdesi({ nakitTl: '150000.40', alacakTl: '42000.60', borcTl: '18000.00', aylikKarTl: '-2500.49' })));
    panoyuAc();
    await screen.findByText('42.001');
    expect(kart('Kasada ve bankada').textContent).toContain('150.000');
    expect(kart('Borç').textContent).toContain('18.000');
    expect(kart('Aylık ortalama kâr').textContent).toContain('-2.500');
    expect(kart('Aylık ortalama kâr').textContent).toContain('Son 3 tamamlanmış ay');
    await vi.waitFor(() => expect(kart('Aylık ortalama kâr').getAttribute('href')).toBe('/finans/gelir-tablosu'));
    cleanup();
    sunucuKur(['finans.oku'], () => json(200, ozetGovdesi({})));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Kasada ve bankada').textContent).toContain('Veri yok'));
    expect(kart('Alacak').getAttribute('href')).toBeNull();
  });

  it('#1117: aylık gelir ve gider iki seriyle; kuru eksik ay çizilmez ve atlandığı yazılır; okuyan değilse gelir tablosuna bağlanmaz', async () => {
    const aylar = [
      { ay: '2026-08', gelirTl: '410000.40', giderTl: '350000.00' },
      { ay: '2026-09', gelirTl: null, giderTl: '300000.00' },
      { ay: '2026-10', gelirTl: '120000.00', giderTl: '90000.60' },
    ];
    const istekler = sunucuKur(['finans.oku'], () => json(200, ozetGovdesi({})), { '/finans/aylik-seri': () => json(200, { aylar }) });
    panoyuAc();
    const tablo = await screen.findByRole('table', { name: 'Aylık gelir ve gider' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['08.26Gelir 410.000 TL, Gider 350.000 TL', '10.26Gelir 120.000 TL, Gider 90.001 TL']);
    const grafik = screen.getByText('Aylık gelir ve gider', { selector: '.tc-grafik-baslik' }).closest('.tc-grafik-karti');
    expect(grafik?.textContent).toContain('1 ayın kuru eksik, gösterilmedi');
    expect(grafik?.getAttribute('href')).toBeNull();
    expect(istekler.filter((y) => y === '/finans/aylik-seri')).toHaveLength(1);
  });

  it('#1117: aylık seri boşsa "Veri yok", sıfır çizmez', async () => {
    sunucuKur(['finans.oku'], () => json(200, ozetGovdesi({})), { '/finans/aylik-seri': () => json(200, { aylar: [] }) });
    panoyuAc();
    const grafik = (await screen.findByText('Aylık gelir ve gider', { selector: '.tc-grafik-baslik' })).closest('.tc-grafik-karti');
    await vi.waitFor(() => expect(grafik?.querySelector('.tc-grafik-durum')?.textContent).toBe('Veri yok'));
    expect(grafik?.querySelector('svg.tc-grafik-cizim')).toBeNull();
  });
  it('#162: siparişten beklenen ödeme 7 gün kartında ayrı tahmin olarak yazılır; sayı ve toplam değişmez; kur eksikse tutar yazılmaz', async () => {
    sunucuKur(['sayfa.finans', 'finans.oku'], () => json(200, ozetGovdesi({ yaklasanOdeme: { sayi: 2, tutarTl: '800.00' }, yaklasanSiparis: { sayi: 3, tutarTl: '1500.00' } })));
    panoyuAc();
    await vi.waitFor(() => expect(kart('7 gün içinde ödeme').textContent).toContain('Toplam 800,00 TL · siparişten 3, 1.500,00 TL tahmini'));
    expect(kart('7 gün içinde ödeme').textContent).toContain('2');
    cleanup();
    sunucuKur(['sayfa.finans', 'finans.oku'], () => json(200, ozetGovdesi({ yaklasanOdeme: { sayi: 2, tutarTl: '800.00' }, yaklasanSiparis: { sayi: 1, tutarTl: null } })));
    panoyuAc();
    await vi.waitFor(() => expect(kart('7 gün içinde ödeme').textContent).toContain('Toplam 800,00 TL · siparişten 1, kur eksik'));
  });
});
