import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GozlerCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GozStoklariCevabi, KonumAyrintiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GozPaneli } from './GozPaneli.tsx';
import { BolmeCephesi } from './RafCephesi.tsx';

const GOZLER = {
  raf: { id: 7, kod: 'R1', ad: 'Palet rafı', aktif: true },
  satirlar: [{ id: 100, adres: 'R1-01-1-1', bolme: 1, kat: 1, goz: 1 }, { id: 101, adres: 'R1-01-2-1', bolme: 1, kat: 2, goz: 1 }],
  toplam: 2,
  sayfaBoyu: 200,
} satisfies GozlerCevabi;

const STOK = { gozler: [{ gozId: 100, konumId: 55, kalemSayisi: 1, ilkMalzemeAd: 'Çelik çubuk' }] } satisfies GozStoklariCevabi;
const BAKIYE = {
  id: 9, malzemeId: 4, malzemeAd: 'Çelik çubuk', konumId: 55, konumKod: 'R1-01-1-1', partiId: 1, partiEtiketi: 'LT-000001 · S1',
  miktar: '120.000', ilkGiris: '2026-11-01T08:00:00.000Z', ambalaj: null, statuId: null, kaliteDurumu: 'serbest', sonKullanma: null, konumaGelis: null,
};
const KONUM = { bakiyeler: [BAKIYE] } as unknown as KonumAyrintiCevabi;
const ESKI = [{ id: 1, gozId: 100, adres: 'R1-01-1-1', kod: 'S2', ad: 'Eski kalem', doluluk: 40, malzeme: null }];

function sunucuKur(kullanici: Kullanici, stokDurumu = 200): string[] {
  const yollar: string[] = [];
  const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici } satisfies OturumCevabi));
    if (yol.startsWith('/atolye/raflar/7/gozler')) return Promise.resolve(cevap(GOZLER));
    if (yol.startsWith('/stok/goz-stoklari')) return Promise.resolve(stokDurumu === 200 ? cevap(STOK) : cevap({ kod: 'YETKI', mesaj: 'yok' }, stokDurumu));
    if (yol === '/stok/konumlar/55') return Promise.resolve(cevap(KONUM));
    if (yol === '/stok/malzemeler/4') return Promise.resolve(cevap({ satir: { birim: 'kg' } }));
    if (yol === '/atolye/kalem-gorunumleri') return Promise.resolve(cevap({ kalemler: [] }));
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
  return yollar;
}

function goster(kat: number, kalemler: typeof ESKI = []) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <GozPaneli rafId={7} bolme={1} kat={kat} goz={1} kalemler={kalemler as never} yazabilir rafAktif />
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('göz panelinde stok', () => {
  it('3012 a: stok okuyan kişi gözdeki malzemeyi, miktarı birimiyle, partiyi ve konum bağlantısını görür; elle ekleme yok', async () => {
    const yollar = sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.atolye', 'stok.giris', 'atolye.kalem-yaz'] });
    goster(1);
    const liste = await screen.findByRole('region', { name: 'Stoktaki malzemeler' });
    expect(within(liste).getByText('Çelik çubuk')).toBeTruthy();
    expect(await within(liste).findByText('120 kg')).toBeTruthy();
    expect(within(liste).getByText('LT-000001 · S1')).toBeTruthy();
    expect(within(liste).getByRole('link', { name: 'Stok konumu' }).getAttribute('href')).toBe('/stok/konumlar/55');
    expect(yollar).toContain('/stok/goz-stoklari?gozIdler=100');
    expect(screen.queryByRole('button', { name: 'Kalem koy' })).toBeNull();
  });

  it('3012 a: elle yazılmış eski kayıt yalnız görünür (düzeltme ve silme yok)', async () => {
    sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.stok', 'atolye.kalem-yaz'] });
    goster(1, ESKI);
    expect(await screen.findByText('Eski elle yazılan kayıtlar (1) · %40')).toBeTruthy();
    expect(screen.getByText('S2')).toBeTruthy();
    expect(screen.queryByLabelText('S2 doluluğu %')).toBeNull();
    expect(screen.queryByRole('button', { name: 'S2 kalemini gözden kaldır' })).toBeNull();
  });

  it('3012 a: cephede göz durumu Stok\'tan; stok bilgisi yoksa (yetki yok) "boş" değil "—"', () => {
    const raf = { kod: 'R1', bolmeSayisi: 1, katSayisi: 2, gozSayisi: 1 };
    render(<BolmeCephesi raf={raf} bolme={1} stok={new Map([['1-1-1', 2]])} secili={null} sec={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Kat 1 göz 1: stokta 2 kalem' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kat 2 göz 1: boş' })).toBeTruthy();
    cleanup();
    render(<BolmeCephesi raf={raf} bolme={1} stok={null} secili={null} sec={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Kat 1 göz 1: stok bilgisi yok' })).toBeTruthy();
    expect(screen.queryByText('boş')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('stoksuz gözde "Stokta yok" yazar', async () => {
    sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.stok'] });
    goster(2);
    expect(await screen.findByText('Stokta yok.')).toBeTruthy();
  });

  it('3012 a: stok yetkisi olmayana miktar yok ve stok isteği atılmaz; uç reddederse hata görünür', async () => {
    const yollar = sunucuKur({ id: 2, ad: 'Operatör', islemler: ['sayfa.atolye'] });
    goster(1);
    expect(await screen.findByRole('heading', { name: 'R1-01-1-1' })).toBeTruthy();
    expect(screen.getByText("Gözün içeriği Stok'tan gelir; görmek için stok görme yetkisi gerekir.")).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Stoktaki malzemeler' })).toBeNull();
    expect(screen.queryByText(/120/)).toBeNull();
    expect(yollar.some((y) => y.startsWith('/stok/'))).toBe(false);
    cleanup();

    const ikinci = sunucuKur({ id: 3, ad: 'Depocu', islemler: ['stok.sayim'] }, 403);
    goster(1);
    await screen.findByRole('heading', { name: 'R1-01-1-1' });
    await vi.waitFor(() => expect(ikinci).toContain('/stok/goz-stoklari?gozIdler=100'));
    expect(await screen.findByText(/Gözün stoğu alınamadı|yok/)).toBeTruthy();
    expect(screen.queryByText(/120/)).toBeNull();
  });
});
