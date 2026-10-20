import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { RevizyonOzetiCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { AdimliOzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { anaSayfaKartlari, haftalikDoluluk } from './ana-sayfa.tsx';

// Şirket özeti emir kartları emir listesini okuyanla görünür: ilk işlem kartın işlemi, liste "veya" (#1085).
// Planı okuyan da görür (288 a); emir listesine giremediği için kart ona bağlantı vermez.
const EMIR_OKUYAN = ['sayfa.uretim-emirleri', 'sayfa.uretim-emirleri', 'sayfa.rota', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'plan.yaz', 'plan.oku'];
const PLANCI = { id: 1, ad: 'Deneme Planci', islemler: ['sayfa.rota', 'plan.yaz'] };

// Sayıları sunucu sayar (sunucu testleri listeden sayılanla aynı olduğunu ölçer); kart yalnız gösterir.
const REVIZYON: RevizyonOzetiCevabi = { acikRevizyon: 2, onayBekleyen: 1 };
const EMIRLER: AdimliOzetCevabi = { taslak: 1, planli: 2, basladi: 2, acik: 5, geciken: 2, biten: 1 };

const yuk = (kod: string, dolu: number[], kapasite: number[]) => ({ istasyonId: kod.length, kod, ad: kod, dolu, kapasite });
const PLAN = {
  gostergeler: { geciken: 3 },
  emirler: [{ uretimEmriId: 1, engelli: true }, { uretimEmriId: 2, engelli: false }, { uretimEmriId: 3, engelli: true }],
  istasyonYuku: [yuk('T-01', [240, 240, 0, 0, 0, 0, 0, 999], [480, 480, 480, 480, 480, 0, 0, 480]), yuk('F-01', [0, 0], [0, 0])],
} as unknown as PlanCevabi;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function kur(
  cevap: Response = new Response(JSON.stringify(REVIZYON)), emirCevabi: Response = new Response(JSON.stringify(EMIRLER)), planCevabi: Response = new Response(JSON.stringify(PLAN)),
  kullanici: { id: number; ad: string; islemler: string[] } = PLANCI,
): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/rota/revizyon-ozeti') return Promise.resolve(cevap.clone());
    if (yol === '/adimli-emirler/ozet') return Promise.resolve(emirCevabi.clone());
    if (yol === '/plan') return Promise.resolve(planCevabi.clone());
    if (yol === '/oturum') return Promise.resolve(new Response(JSON.stringify({ kullanici })));
    return Promise.resolve(new Response('{}', { status: 404 }));
  }));
  const Hepsi = () => <>{anaSayfaKartlari.map(({ anahtar, ekran: Ekran }) => <Ekran key={anahtar} />)}</>;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Hepsi /></MemoryRouter>
    </QueryClientProvider>,
  );
  return yollar;
}

const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti');

describe('rota ana sayfa kartları (#489)', () => {
  it('açık revizyon ve onay bekleyen sunucu özetinden gelir; ürün listesi çekilmez; iki kart tek istek', async () => {
    const yollar = kur();
    await waitFor(() => expect(kart('Açık rota revizyonu')?.textContent).toContain('2'));
    expect(kart('Onay bekleyen rota')?.textContent).toContain('1');
    expect(kart('Onay bekleyen rota')?.getAttribute('href')).toBe('/recete-rota/schema');
    // Rota tanımı Reçete ve Rota'dadır (borç R11).
    expect(kart('Açık rota revizyonu')?.getAttribute('href')).toBe('/recete-rota/schema');
    expect(yollar.filter((y) => y === '/rota/revizyon-ozeti')).toHaveLength(1);
    expect(yollar).not.toContain('/rota/urunler');
  });

  it('reddedilen: liste alınamazsa sıfır yazmaz, "Alınamadı" der', async () => {
    kur(new Response('{}', { status: 500 }), new Response('{}', { status: 500 }), new Response('{}', { status: 500 }));
    await waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(9));
    expect(screen.queryByText('0')).toBeNull();
  });

  it('kart görünürlüğü işleme bağlı: açık revizyon rota yazana, onay bekleyen onaylayana', () => {
    expect(Object.fromEntries(anaSayfaKartlari.map((k) => [k.anahtar, [k.bolum, k.islem, ...(k.veya ?? [])]]))).toEqual({
      'rota-acik-revizyon': ['is', 'rota.yaz'],
      'rota-onay-bekleyen': ['is', 'rota.onayla'],
      'rota-yonetim-acik-emir': ['yonetim', ...EMIR_OKUYAN],
      'rota-yonetim-geciken-emir': ['yonetim', ...EMIR_OKUYAN],
      'rota-yonetim-uretim-akisi': ['yonetim', ...EMIR_OKUYAN],
      'plan-yonetim-doluluk': ['yonetim', 'sayfa.rota', 'plan.yaz', 'plan.oku'],
      'plan-geciken-emir': ['is', 'plan.oku', 'plan.yaz'],
      'plan-girmeyen-emir': ['is', 'plan.oku', 'plan.yaz'],
      'plan-istasyon-dolulugu': ['grafik', 'plan.oku', 'plan.yaz'],
    });
  });

  it('#664: açık ve geciken emir sunucu özetinden gelir; emir listesi çekilmez; iki kart tek istek', async () => {
    const yollar = kur();
    await waitFor(() => expect(kart('Açık emir')?.textContent).toContain('5'));
    expect(kart('Geciken emir')?.textContent).toContain('2');
    await waitFor(() => expect(kart('Açık emir')?.getAttribute('href')).toBe('/uretim-emirleri'));
    expect(yollar.filter((y) => y === '/adimli-emirler/ozet')).toHaveLength(1);
    expect(yollar).not.toContain('/adimli-emirler');
  });

  it('288 a: yalnız planı okuyan emir kartlarının sayısını görür, emir listesine bağlantı almaz', async () => {
    const yollar = kur(undefined, undefined, undefined, { id: 2, ad: 'Deneme Okuyan', islemler: ['plan.oku'] });
    await waitFor(() => expect(kart('Açık emir')?.textContent).toContain('5'));
    await waitFor(() => expect(yollar).toContain('/oturum'));
    expect(kart('Geciken emir')?.textContent).toContain('2');
    expect(document.querySelector('a[href="/uretim-emirleri"]')).toBeNull();
    // Plan kartları plan sayfasına götürür; sayfaya giriş menü işleminden ayrı denetlenir.
    expect(kart('Plana girmeyen emir')?.getAttribute('href')).toBe('/recete-rota/plan');
  });

  it('#724: planlamacı kartları canlı planı tek istekle okur: plandaki geciken, plana girmeyen emir ve bu haftaki istasyon doluluğu', async () => {
    const yollar = kur();
    await waitFor(() => expect(kart('Planda geciken emir')?.textContent).toContain('3'));
    expect(kart('Plana girmeyen emir')?.textContent).toContain('2');
    expect(kart('Plana girmeyen emir')?.getAttribute('href')).toBe('/recete-rota/plan');
    expect(screen.getAllByText('Bu hafta istasyon doluluğu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%20').length).toBeGreaterThan(0);
    expect(yollar.filter((y) => y === '/plan')).toHaveLength(1);
  });

  it('#724: doluluk yedi günün dolu dakikasını çalışma dakikasına böler; sekizinci gün ve çalışma zamanı olmayan istasyon girmez', () => {
    expect(haftalikDoluluk(PLAN.istasyonYuku)).toEqual([{ etiket: 'T-01', deger: 20 }]);
    expect(haftalikDoluluk([])).toEqual([]);
  });

  it('#1085: üretim akışı özetin sayılarını adımlara yazar; geciken adımı uyarı tonunda; aynı özet isteğini paylaşır', async () => {
    const yollar = kur();
    const tablo = await screen.findByRole('table', { name: 'Üretim akışı' });
    await waitFor(() => expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['Taslak1', 'Planlı2', 'Üretimde2', 'Geciken2', 'Biten1']));
    const akis = screen.getByText('Üretim akışı', { selector: '.tc-grafik-baslik' }).closest('.tc-grafik-karti');
    expect([...(akis?.querySelectorAll('.tc-akis-adim[data-dikkat]') ?? [])].map((a) => a.querySelector('.tc-akis-etiket')?.textContent)).toEqual(['Geciken']);
    await waitFor(() => expect(akis?.getAttribute('href')).toBe('/uretim-emirleri'));
    expect(yollar.filter((y) => y === '/adimli-emirler/ozet')).toHaveLength(1);
  });

  it('#1085: şirket özetinde doluluk iş merkezi başına çubuk; kapasiteyi aşan hata tonunda, yüzde 100 tavanı', async () => {
    const asan = { ...PLAN, istasyonYuku: [...PLAN.istasyonYuku, yuk('K-01', [600], [480])] } as unknown as PlanCevabi;
    kur(undefined, undefined, new Response(JSON.stringify(asan)));
    // Eğilimler bölümündeki aynı başlıklı çubuk grafik de çizilir; şirket özeti kartı çubuk listesidir.
    await waitFor(() => expect(document.querySelector('.tc-cubuk-listesi')).not.toBeNull());
    const tablo = document.querySelector('.tc-cubuk-listesi')!.closest('.tc-grafik-karti')!.querySelector('table')!;
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['T-01%20', 'K-01%125']);
    const satirlar = [...document.querySelectorAll('.tc-cubuk-satir')];
    expect(satirlar.map((s) => s.getAttribute('data-ton'))).toEqual([null, 'hata']);
    expect(satirlar.map((s) => s.querySelector('rect')?.getAttribute('width'))).toEqual(['20%', '100%']);
  });
});
