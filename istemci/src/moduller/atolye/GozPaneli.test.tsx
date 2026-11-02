import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GozlerCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GozStoklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GozPaneli } from './GozPaneli.tsx';
import { BolmeCephesi } from './RafCephesi.tsx';

const GOZLER = {
  raf: { id: 7, kod: 'R1', ad: 'Palet rafı', aktif: true },
  satirlar: [{ id: 100, adres: 'R1-01-1-1', bolme: 1, kat: 1, goz: 1 }, { id: 101, adres: 'R1-01-2-1', bolme: 1, kat: 2, goz: 1 }],
  toplam: 2,
  sayfaBoyu: 200,
} satisfies GozlerCevabi;

const STOK = { gozler: [{ gozId: 100, konumId: 55, kalemSayisi: 3, ilkMalzemeAd: 'Çelik çubuk' }] } satisfies GozStoklariCevabi;

function sunucuKur(kullanici: Kullanici, stokDurumu = 200): string[] {
  const yollar: string[] = [];
  const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici } satisfies OturumCevabi));
    if (yol.startsWith('/atolye/raflar/7/gozler')) return Promise.resolve(cevap(GOZLER));
    if (yol.startsWith('/stok/goz-stoklari')) return Promise.resolve(stokDurumu === 200 ? cevap(STOK) : cevap({ kod: 'YETKI', mesaj: 'yok' }, stokDurumu));
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
  return yollar;
}

function goster(kat: number) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <GozPaneli rafId={7} bolme={1} kat={kat} goz={1} kalemler={[]} yazabilir={false} rafAktif />
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
  it('stok okuyan kişi gözdeki kalem sayısını, ilk malzemeyi ve konum bağlantısını görür', async () => {
    const yollar = sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.atolye', 'stok.giris'] });
    goster(1);
    expect((await screen.findByText('3 kalem')).closest('p')?.textContent).toContain('(ilk: Çelik çubuk)');
    expect(screen.getByRole('link', { name: 'Stok konumu' }).getAttribute('href')).toBe('/stok/konumlar/55');
    expect(yollar).toContain('/stok/goz-stoklari?gozIdler=100');
  });

  it('ATL-3 doluluğu girilmemiş stoklu göz "boş" denmez; stoksuz göz boştur', async () => {
    sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.stok'] });
    goster(1);
    expect(await screen.findByText('Gözde stok var; doluluk girilmedi.')).toBeTruthy();
    expect(screen.queryByText('Göz boş.')).toBeNull();
    cleanup();
    goster(2);
    expect(await screen.findByText('Stokta yok.')).toBeTruthy();
    expect(screen.getByText('Göz boş.')).toBeTruthy();
  });

  it('ATL-3 cephede doluluğu girilmemiş stoklu göz "stokta" yazar', () => {
    render(
      <BolmeCephesi
        raf={{ kod: 'R1', bolmeSayisi: 1, katSayisi: 2, gozSayisi: 1 }}
        bolme={1}
        ozetler={new Map()}
        stoklu={new Set(['1-1-1'])}
        secili={null}
        sec={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Kat 1 göz 1: stokta, doluluk girilmedi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kat 2 göz 1: boş' })).toBeTruthy();
  });

  it('stoksuz gözde "Stokta yok" yazar', async () => {
    sunucuKur({ id: 1, ad: 'Depocu', islemler: ['sayfa.stok'] });
    goster(2);
    expect(await screen.findByText('Stokta yok.')).toBeTruthy();
  });

  it('stok yetkisi olmayana satır yok ve istek atılmaz; uç reddederse satır gizlenir', async () => {
    const yollar = sunucuKur({ id: 2, ad: 'Operatör', islemler: ['sayfa.atolye'] });
    goster(1);
    expect(await screen.findByRole('heading', { name: 'R1-01-1-1' })).toBeTruthy();
    expect(screen.queryByText(/Stok/)).toBeNull();
    expect(yollar.some((y) => y.startsWith('/stok/'))).toBe(false);
    cleanup();

    const ikinci = sunucuKur({ id: 3, ad: 'Depocu', islemler: ['stok.sayim'] }, 403);
    goster(1);
    await screen.findByRole('heading', { name: 'R1-01-1-1' });
    await vi.waitFor(() => expect(ikinci).toContain('/stok/goz-stoklari?gozIdler=100'));
    await vi.waitFor(() => expect(screen.queryByText(/Stok/)).toBeNull());
  });
});
