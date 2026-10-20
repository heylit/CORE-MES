import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { PanoOzetiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const OZET = { makine: { toplam: 12, calisir: 9, ariza: 2, bakim: 1 }, personel: { kisi: 18, isMerkezi: 3 } } satisfies PanoOzetiCevabi;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function kur(islemler: Islem[], ozet: Response = new Response(JSON.stringify(OZET))): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return Promise.resolve(new Response(JSON.stringify({ kullanici: { id: 1, ad: 'Deneme', islemler } } satisfies OturumCevabi)));
    if (yol === '/istasyonlar/pano-ozeti') return Promise.resolve(ozet.clone());
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

describe('istasyonlar ana sayfa kartları (#483)', () => {
  it('üç kart tek istekle sayıları gösterir; duran makine arıza ve bakımın toplamıdır', async () => {
    const yollar = kur(['sayfa.istasyonlar', 'sayfa.vardiya']);
    await waitFor(() => expect(kart('Duran makine')?.textContent).toContain('3'));
    expect(kart('Duran makine')?.textContent).toContain('2 arıza, 1 bakım');
    expect(kart('Çalışan makine')?.textContent).toContain('912 makineden');
    expect(kart('Personel')?.textContent).toContain('183 iş merkezine bağlı');
    expect(yollar.filter((y) => y === '/istasyonlar/pano-ozeti')).toHaveLength(1);
  });

  it('sayfası olan için kart bağlantıdır, olmayan için değildir', async () => {
    kur(['sayfa.terminal', 'sayfa.personel']);
    await waitFor(() => expect(kart('Duran makine')?.textContent).toContain('3'));
    expect(kart('Duran makine')?.tagName).toBe('DIV');
    expect(kart('Personel')?.getAttribute('href')).toBe('/personel');
    cleanup();
    kur(['sayfa.istasyonlar', 'sayfa.vardiya', 'sayfa.personel']);
    await waitFor(() => expect(kart('Duran makine')?.getAttribute('href')).toBe('/istasyonlar/makineler'));
    expect(kart('Personel')?.getAttribute('href')).toBe('/vardiya/personel');
  });

  it('IS22: bakım rolü istasyonlar sayfası olmadan duran makineyi görür ve Arkon bakım ekranına gider', async () => {
    kur(['sayfa.arkon', 'arkon.bakim']);
    await waitFor(() => expect(kart('Duran makine')?.getAttribute('href')).toBe('/arkon/bakim'));
    expect(kart('Duran makine')?.textContent).toContain('2 arıza, 1 bakım');
  });

  it('IS23, #1085: şirket özetinde makine durumu dağılımı: çalışan / toplam üstte, dilimler durum renginde, durumsuz makine ayrı dilimde', async () => {
    kur(['sayfa.istasyonlar'], new Response(JSON.stringify({ ...OZET, makine: { toplam: 13, calisir: 9, ariza: 2, bakim: 1 } })));
    const grafik = () => screen.getByText('Makine durumu', { selector: '.tc-grafik-baslik' }).closest('.tc-grafik-karti');
    await waitFor(() => expect(grafik()?.querySelector('.tc-grafik-son')?.textContent).toBe('9 / 13'));
    const tablo = screen.getByRole('table', { name: 'Makine durumu' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['Çalışıyor9 makine', 'Bakımda1 makine', 'Arızada2 makine', 'Durumu girilmemiş1 makine']);
    expect([...(grafik()?.querySelectorAll('g[data-durum]') ?? [])].map((g) => g.getAttribute('data-durum'))).toEqual(['calisiyor', 'durakli', 'durdu', 'sirada']);
    expect(grafik()?.getAttribute('href')).toBe('/istasyonlar/makineler');
    expect(anaSayfaKartlari.find((k) => k.anahtar === 'istasyonlar-makine-durumu')?.bolum).toBe('yonetim');
  });

  it('reddedilen: uç hata verirse sıfır yazmaz, "Alınamadı" der', async () => {
    kur(['sayfa.istasyonlar'], new Response('{}', { status: 500 }));
    await waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(4));
    expect(screen.queryByText('0')).toBeNull();
  });

  it('kart görünürlüğü işleme bağlı: duran makine terminalle, personel vardiya ya da personel sayfasıyla', () => {
    const gorunur = Object.fromEntries(anaSayfaKartlari.map((k) => [k.anahtar, [k.islem, ...(k.veya ?? [])]]));
    expect(gorunur).toEqual({
      'istasyonlar-makine-durumu': ['sayfa.istasyonlar', 'istasyonlar.yaz', 'sayfa.terminal', 'sayfa.vardiya', 'sayfa.personel', 'arkon.bakim'],
      'istasyonlar-duran-makine': ['sayfa.istasyonlar', 'sayfa.terminal', 'arkon.bakim'],
      'istasyonlar-calisan-makine': ['sayfa.istasyonlar'],
      'istasyonlar-personel': ['sayfa.vardiya', 'sayfa.personel'],
    });
  });
});
