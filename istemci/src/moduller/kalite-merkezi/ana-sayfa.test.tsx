import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { KmIlkParcaBekleyenCevabi, KmOzetCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevaplar: Record<string, () => Response>) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return cevaplar[yol]?.() ?? json(404, { kod: 'YOK', mesaj: yol });
  }));
  return yollar;
}

function kartlariAc(anahtarlar: string[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{anaSayfaKartlari.filter((k) => anahtarlar.includes(k.anahtar)).map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;
const gorunen = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((k) => k.anahtar);

const BEKLEYEN: KmIlkParcaBekleyenCevabi = {
  emirler: [
    { uretimEmriId: 1, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Parça', adet: 10, kararBekleyenAdet: 2 },
    { uretimEmriId: 2, emirNo: 'E-2', parcaNo: 'P-2', parcaAd: 'Parça', adet: 5, kararBekleyenAdet: 1 },
  ],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kalite Merkezi pano kartları', () => {
  it('ilk parça kartı bekleyen emirleri sayar, bekleyen adedi yazar ve Bugün görünümüne götürür', async () => {
    const yollar = sunucuKur({ '/kalite-merkezi/ilk-parca/bekleyenler': () => json(200, BEKLEYEN) });
    kartlariAc(['kalite-merkezi-ilk-parca']);
    await screen.findByText('2');
    expect(kart('İlk parça kararı bekleyen emir').textContent).toContain('3 adet karar bekliyor');
    expect(kart('İlk parça kararı bekleyen emir').getAttribute('href')).toBe('/kalite-merkezi');
    expect(kart('İlk parça kararı bekleyen emir').getAttribute('data-ton')).toBe('uyari');
    expect(yollar).toEqual(['/kalite-merkezi/ilk-parca/bekleyenler']);
  });

  it('bekleyen yoksa sıfır, uyarı tonu yok; uç hata verirse "Alınamadı"', async () => {
    sunucuKur({ '/kalite-merkezi/ilk-parca/bekleyenler': () => json(200, { emirler: [] } satisfies KmIlkParcaBekleyenCevabi) });
    kartlariAc(['kalite-merkezi-ilk-parca']);
    await screen.findByText('0');
    expect(kart('İlk parça kararı bekleyen emir').getAttribute('data-ton')).toBeNull();
    cleanup();
    sunucuKur({ '/kalite-merkezi/ilk-parca/bekleyenler': () => json(403, { kod: 'YETKI', mesaj: 'x' }) });
    kartlariAc(['kalite-merkezi-ilk-parca']);
    await screen.findByText('Alınamadı');
  });

  it('uygunsuzluk uyarısı ve şirket özeti tek özet isteğini paylaşır; uyarı uygunsuzluk listesine götürür', async () => {
    const yollar = sunucuKur({ '/kalite-merkezi/ozet': () => json(200, { acikUygunsuzluk: 4 } satisfies KmOzetCevabi) });
    kartlariAc(['kalite-merkezi-yonetim-uygunsuzluk', 'kalite-merkezi-uygunsuzluk']);
    expect(await screen.findAllByText('4')).toHaveLength(2);
    const yollu = screen.getAllByText('Açık uygunsuzluk').map((b) => b.closest('.tc-sayi-karti')?.getAttribute('href'));
    expect(yollu).toContain('/kalite-merkezi/uygunsuzluklar');
    expect(yollar).toEqual(['/kalite-merkezi/ozet']);
  });

  it('kartlar uçların yetkisiyle görünür: ilk parça karar verene, uyarı kalite kaydı yazana', () => {
    // Şirket özeti kartı ayrıca bölüm işlemini ister (73 b); bu test bölümün kendisini değil kartın okuma işlemini ölçer.
    expect(gorunen(['pano.sirket-ozeti', 'kalite-merkezi.oku'])).toEqual(['kalite-merkezi-yonetim-uygunsuzluk']);
    expect(gorunen(['kalite-merkezi.oku', 'kalite-merkezi.onayla'])).toContain('kalite-merkezi-ilk-parca');
    expect(gorunen(['kalite-merkezi.oku', 'kalite-merkezi.onayla'])).not.toContain('kalite-merkezi-uygunsuzluk');
    expect(gorunen(['kalite-merkezi.oku', 'kalite-merkezi.yaz'])).toContain('kalite-merkezi-uygunsuzluk');
    expect(gorunen(['sayfa.stok'])).toEqual([]);
  });
});
