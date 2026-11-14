import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GozlerCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GozOzetleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { RafSilmePenceresi, type SilinecekRaf } from './RafSilmePenceresi.tsx';

const RAF: SilinecekRaf = { id: 7, kod: 'ORNA', aktif: true, gozAdedi: 12 };
const GOZLER = {
  raf: { id: 7, kod: 'ORNA', ad: 'Örnek raf', aktif: true },
  satirlar: [{ id: 100, adres: 'ORNA-01-2-1', bolme: 1, kat: 2, goz: 1 }, { id: 101, adres: 'ORNA-02-1-1', bolme: 2, kat: 1, goz: 1 }],
  toplam: 2,
  sayfaBoyu: 200,
} satisfies GozlerCevabi;
const DOLU = {
  gozler: [{ gozId: 101, konumId: 56, malzemeler: [{ malzemeId: 5, ad: 'Örnek çubuk', birim: 'KG', miktar: '12.500', ambalaj: null }] },
    { gozId: 100, konumId: 55, malzemeler: [{ malzemeId: 4, ad: 'Örnek braket', birim: 'Adet', miktar: '240.000', ambalaj: null }] }],
} satisfies GozOzetleriCevabi;
const kisi = (islemler: string[]) => ({ id: 1, kullaniciAdi: 'k', ad: 'K', roller: [], islemler }) as unknown as Kullanici;

function sunucuKur(kullanici: Kullanici, ozet: GozOzetleriCevabi): string[] {
  const yollar: string[] = [];
  const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici } satisfies OturumCevabi));
    if (yol.startsWith('/atolye/raflar/7/gozler')) return Promise.resolve(cevap(GOZLER));
    if (yol.startsWith('/stok/goz-ozetleri')) return Promise.resolve(cevap(ozet));
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
  return yollar;
}

function goster(raf: SilinecekRaf | null = RAF) {
  const olay = { vazgec: vi.fn(), sil: vi.fn(), pasifeAl: vi.fn() };
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RafSilmePenceresi raf={raf} {...olay} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return olay;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RafSilmePenceresi (3230 a)', () => {
  it('malzemeli raf silinemez: gözler adres sırasıyla listelenir, "Rafı sil" yoktur, "Pasife al" ve "Depoda göster" vardır', async () => {
    sunucuKur(kisi(['sayfa.atolye', 'atolye.salon-yaz', 'sayfa.stok']), DOLU);
    const olay = goster();
    const pencere = await screen.findByRole('dialog', { name: 'Raf ORNA silinemez' });
    const satirlar = within(pencere).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(satirlar).toEqual(['ORNA-01-2-1Örnek braket240 adet', 'ORNA-02-1-1Örnek çubuk12,5 kg']);
    expect(within(pencere).queryByRole('button', { name: 'Rafı sil' })).toBeNull();
    expect(within(pencere).getByRole('link', { name: 'Depoda göster' }).getAttribute('href')).toBe('/atolye?ara=ORNA');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Pasife al' }));
    expect(olay.pasifeAl).toHaveBeenCalledOnce();
    expect(olay.sil).not.toHaveBeenCalled();
  });

  it('boş raf onayla silinir: göz sayısı, kalemlerin geri gelmeyeceği ve etiket uyarısı yazar', async () => {
    sunucuKur(kisi(['sayfa.atolye', 'atolye.salon-yaz', 'sayfa.stok']), { gozler: [] });
    const olay = goster();
    const pencere = await screen.findByRole('dialog', { name: 'Raf ORNA silinsin mi?' });
    expect(pencere.textContent).toContain('Rafta malzeme yok. Raf ve 12 gözü haritadan tamamen kalkar; gözlere elle girilmiş kalemler de silinir, geri gelmez.');
    expect(pencere.textContent).toContain('basılı etiketleri geçersiz kalır');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Rafı sil' }));
    expect(olay.sil).toHaveBeenCalledOnce();
  });

  it('stok göremeyen kişi için stok isteği atılmaz; pencere silmenin kayıtta reddedilebileceğini söyler', async () => {
    const yollar = sunucuKur(kisi(['sayfa.atolye', 'atolye.salon-yaz', 'stok.istek']), DOLU);
    goster();
    const pencere = await screen.findByRole('dialog', { name: 'Raf ORNA silinsin mi?' });
    expect(pencere.textContent).toContain('Rafta malzeme ya da açık iş varsa silme kayıt sırasında reddedilir.');
    expect(yollar.some((y) => y.startsWith('/stok/'))).toBe(false);
    expect(yollar.some((y) => y.startsWith('/atolye/raflar/'))).toBe(false);
  });

  it('raf yokken pencere çizilmez', () => {
    sunucuKur(kisi(['sayfa.atolye']), { gozler: [] });
    goster(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
