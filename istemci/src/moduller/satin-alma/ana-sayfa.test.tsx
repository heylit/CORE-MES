import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SatinAlmaOzetiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: ortak arayüz önce (talep kartları onu ithal eder, o da ana sayfa kartlarını yükler).
import '../../ortak/arayuz/index.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const PANO = ['satin-alma-onay-bekleyen', 'satin-alma-acik-talep', 'satin-alma-teslim-bekleyen', 'satin-alma-acik-siparis'];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

function panoyuAc(cevap: () => Response) {
  const fetchSahte = vi.fn(async () => cevap());
  vi.stubGlobal('fetch', fetchSahte);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.filter((k) => PANO.includes(k.anahtar)).map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchSahte;
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Satın alma pano kartları (#489)', () => {
  it('dört kart tek özet isteğiyle dolar; sayılar ve bağlantılar doğru', async () => {
    const f = panoyuAc(() => json(200, { onayBekleyen: 2, acikTalep: 7, teslimBekleyenSatir: 5, acikSiparis: 3, acikSiparisTutari: '1250.5' } satisfies SatinAlmaOzetiCevabi));
    await screen.findByText('7');
    expect(kart('Onay bekleyen satın alma talepleri').textContent).toContain('2');
    expect(kart('Onay bekleyen satın alma talepleri').getAttribute('href')).toBe('/satin-alma/onaylar');
    expect(kart('Açık satın alma talepleri').getAttribute('href')).toBe('/satin-alma/talepler');
    expect(kart('Teslim beklenen sipariş satırı').textContent).toContain('5');
    expect(kart('Açık sipariş').textContent).toContain('3');
    expect(f.mock.calls.map((c) => String((c as unknown as [string])[0]))).toEqual(['/api/satin-alma/ozet']);
  });

  it('depo kartı teslim bekleyen satır sayısını gösterir ve stoktaki mal kabule götürür', async () => {
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: 6, acikSiparis: null, acikSiparisTutari: null } satisfies SatinAlmaOzetiCevabi)));
    const K = anaSayfaKartlari.find((x) => x.anahtar === 'satin-alma-mal-kabul-bekleyen')!.ekran;
    render(<QueryClientProvider client={istemci}><MemoryRouter><K /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('6');
    expect(kart('Mal kabul bekleyen sipariş satırı').getAttribute('href')).toBe('/stok/mal-kabul');
  });

  it('yetkisiz sayı "Veri yok" der, sıfır uydurmaz; uç hata verirse "Alınamadı"', async () => {
    panoyuAc(() => json(200, { onayBekleyen: 4, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null } satisfies SatinAlmaOzetiCevabi));
    await screen.findByText('4');
    expect(kart('Açık sipariş').textContent).toContain('Veri yok');
    cleanup();
    panoyuAc(() => json(500, { kod: 'SUNUCU', mesaj: 'x' }));
    expect((await screen.findAllByText('Alınamadı')).length).toBe(4);
  });

  it('şirket özeti açık sipariş tutarını tam TL ve onay bekleyen sayısıyla verir; tutar yoksa "Veri yok"', async () => {
    const K = anaSayfaKartlari.find((x) => x.anahtar === 'satin-alma-yonetim-ozet')!.ekran;
    const ac = (g: SatinAlmaOzetiCevabi) => {
      vi.stubGlobal('fetch', vi.fn(async () => json(200, g)));
      const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<QueryClientProvider client={istemci}><MemoryRouter><K /></MemoryRouter></QueryClientProvider>);
    };
    ac({ onayBekleyen: 3, acikTalep: 1, teslimBekleyenSatir: 1, acikSiparis: 2, acikSiparisTutari: '12500.6' });
    await screen.findByText((12501).toLocaleString('tr-TR'));
    const k = kart('Açık satın alma siparişi tutarı');
    expect(k.textContent).toContain('3 talep onay bekliyor');
    expect(k.getAttribute('href')).toBe('/satin-alma');
    cleanup();
    ac({ onayBekleyen: 0, acikTalep: 0, teslimBekleyenSatir: 0, acikSiparis: 1, acikSiparisTutari: null });
    await screen.findByText('Veri yok');
    expect(kart('Açık satın alma siparişi tutarı').textContent).not.toContain('onay bekliyor');
  });

  it('kart işlemleri: onay onaylayana, iş kartları yazana, açık sipariş okuyana; talep kartları yerinde', () => {
    const k = Object.fromEntries(anaSayfaKartlari.map((x) => [x.anahtar, x]));
    expect(k['satin-alma-onay-bekleyen']).toMatchObject({ bolum: 'is', islem: 'satin-alma.onayla' });
    expect(k['satin-alma-acik-talep']).toMatchObject({ bolum: 'is', islem: 'satin-alma.yaz' });
    expect(k['satin-alma-teslim-bekleyen']).toMatchObject({ bolum: 'is', islem: 'satin-alma.yaz' });
    expect(k['satin-alma-mal-kabul-bekleyen']).toMatchObject({ bolum: 'is', islem: 'stok.giris' });
    expect(k['satin-alma-acik-siparis']).toMatchObject({ bolum: 'ozet', islem: 'satin-alma.oku', veya: ['satin-alma.yaz'] });
    // #1085: şirket özeti kartlarını satın almayı okuyan görür.
    expect(k['satin-alma-yonetim-ozet']).toMatchObject({ bolum: 'yonetim', islem: 'satin-alma.oku', veya: ['satin-alma.yaz'] });
    expect(k['satin-alma-yonetim-akis']).toMatchObject({ bolum: 'yonetim', genis: true, islem: 'satin-alma.oku', veya: ['satin-alma.yaz'] });
    expect(k['satin-alma-talep']).toMatchObject({ islem: 'satin-alma.talep-ac' });
    expect(k['satin-alma-taleplerim']).toMatchObject({ islem: 'satin-alma.talep-ac' });
  });

  it('#1085: tedarik akışı talepten teslime dört adım; görülmeyen sayı "–", onay bekleyen uyarı tonunda', async () => {
    const K = anaSayfaKartlari.find((x) => x.anahtar === 'satin-alma-yonetim-akis')!.ekran;
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { onayBekleyen: 2, acikTalep: null, teslimBekleyenSatir: 5, acikSiparis: 3, acikSiparisTutari: null } satisfies SatinAlmaOzetiCevabi)));
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={istemci}><MemoryRouter><K /></MemoryRouter></QueryClientProvider>);
    const tablo = await screen.findByRole('table', { name: 'Tedarik akışı' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['Açık talepVeri yok', 'Onay bekleyen2', 'Açık sipariş3', 'Teslim bekleyen satır5']);
    const adimlar = [...document.querySelectorAll('.tc-akis-adim')];
    expect(adimlar.map((a) => a.querySelector('.tc-akis-sayi')?.textContent)).toEqual(['–', '2', '3', '5']);
    expect(adimlar.map((a) => a.hasAttribute('data-dikkat'))).toEqual([false, true, false, false]);
  });
});
