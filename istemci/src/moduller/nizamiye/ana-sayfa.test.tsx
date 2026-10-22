import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { KapiCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cevap: () => Response) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    return yol === '/nizamiye/kapi' ? cevap() : json(404, { kod: 'YOK', mesaj: yol });
  }));
  return yollar;
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

// Sayılan yalnız dizi boyudur; ziyaret satırının alanları kartta kullanılmaz.
const ziyaret = (id: number) => ({ id }) as unknown as KapiCevabi['beklenen'][number];
const KAPI = {
  simdi: '2026-10-22T08:00:00.000Z',
  beklenen: [ziyaret(1), ziyaret(2), ziyaret(3)],
  iceride: [ziyaret(4)],
  bosKartlar: [{ id: 1, kartNo: 'Z-01', tur: 'ziyaretci', izinliBolge: null }, { id: 2, kartNo: 'Z-02', tur: 'ziyaretci', izinliBolge: null }],
} as KapiCevabi;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Nizamiye pano kartları', () => {
  it('üç kart kapı ucunu bir kez okur; beklenen, içerideki ve boş kartı sayar', async () => {
    const yollar = sunucuKur(() => json(200, KAPI));
    panoyuAc();
    await vi.waitFor(() => expect(kart('Beklenen ziyaretçi').textContent).toContain('3'));
    expect(kart('İçerideki ziyaretçi').textContent).toContain('1');
    expect(kart('Boş ziyaretçi kartı').textContent).toContain('2');
    expect(kart('Beklenen ziyaretçi').getAttribute('href')).toBe('/nizamiye');
    expect(kart('Boş ziyaretçi kartı').getAttribute('href')).toBe('/nizamiye/kartlar');
    expect(yollar).toEqual(['/nizamiye/kapi']);
  });

  it('uç reddederse üç kart da "Alınamadı" gösterir', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI', mesaj: 'x' }));
    panoyuAc();
    await vi.waitFor(() => expect(screen.getAllByText('Alınamadı')).toHaveLength(3));
  });

  it('kartlar kapı ucunun yetkisiyle görünür; nizamiye okuması olmayan görmez', () => {
    const gorunen = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((k) => k.anahtar);
    expect(gorunen(['nizamiye.oku'])).toEqual(['nizamiye-beklenen', 'nizamiye-iceride', 'nizamiye-bos-kart']);
    expect(gorunen(['sayfa.nizamiye', 'nizamiye.yaz'])).toEqual([]);
  });
});
