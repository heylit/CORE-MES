import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HazirDosyalarCevabi, HazirKayitlarCevabi, KlasorlerCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OrtakDosyalar } from './OrtakDosyalar.tsx';

// Hazır listeler (kart 3390). ORN- adlar uydurmadır.
const ikiliOku = vi.fn(async () => new Uint8Array([37, 80, 68, 70]).buffer);
vi.mock('../belge-merkezi/disari.ts', () => ({ DosyaHatasi: class extends Error {}, dosyaYukle: vi.fn(), ikiliOku: (...a: unknown[]) => ikiliOku(...(a as [])),
  sha256: vi.fn(async () => 'a'.repeat(64)), ayniDosyaYerleri: vi.fn(async () => []), AyniDosyaPenceresi: () => null,
}));

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KAYITLAR: HazirKayitlarCevabi = {
  kayitlar: [
    { anahtar: '11', no: 'UE-ORN-0011', baslik: 'ORN Flanş', alt: 'ORN-M001' },
    { anahtar: '12', no: 'UE-ORN-0012', baslik: 'ORN Mil', alt: null },
  ],
  daha: true,
};
const DOSYALAR: HazirDosyalarCevabi = {
  kayit: KAYITLAR.kayitlar[0]!,
  kayitYolu: '/uretim-emirleri/11',
  gruplar: [
    { kaynak: 'cizim', dosyalar: [{ ad: 'ORN-flans-r2.pdf', dosyaTuru: 'pdf', bilgi: 'Rev 2', zaman: '2026-11-10T08:00:00Z', ac: '/cizimler/belge/5', indir: '/cizimler/5/revizyonlar/9/dosya' }] },
    { kaynak: 'klasor', dosyalar: [{ ad: 'ORN-olcu.xlsx', dosyaTuru: 'xlsx', bilgi: 'Teklif', zaman: null, ac: null, indir: '/ortak-dosyalar/klasorler/3/dosyalar/4/surumler/1/dosya' }] },
  ],
  kesildi: true,
  klasor: { tur: 'siparis', id: 3 },
};

function sunucuKur(islemler: Islem[]) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici: { id: 1, ad: 'Deneme', islemler } } satisfies OturumCevabi);
    if (yol === '/ortak-dosyalar/klasorler') return json(200, { klasorler: [], yonetici: false, arsivSayisi: 0 } satisfies KlasorlerCevabi);
    if (yol.startsWith('/ortak-dosyalar/hazir/uretim-emri/11')) return json(200, DOSYALAR);
    if (yol.startsWith('/ortak-dosyalar/hazir/uretim-emri')) return json(200, yol.includes('ara=') ? { kayitlar: [], daha: false } : KAYITLAR);
    return json(404, { kod: 'BULUNAMADI', mesaj: yol });
  }));
  return yollar;
}

function ciz(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter initialEntries={[adres]}><OrtakDosyalar gorunum="hazir" liste="uretim-emri" /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); ikiliOku.mockClear(); });

describe('hazır listeler (kart 3390)', () => {
  it('menü yalnız okunabilen listeyi gösterir; kayıt seçilince dosyaları gruplu gelir', async () => {
    sunucuKur(['sayfa.ortak-dosyalar', 'sayfa.uretim-emirleri']);
    ciz('/ortak-dosyalar/hazir/uretim-emri');
    const menu = await screen.findByRole('navigation', { name: 'Hazır listeler' });
    await waitFor(() => expect(within(menu).getByRole('link', { name: /Üretim emirleri/ })).toBeTruthy());
    expect(within(menu).queryByRole('link', { name: /Satın alma/ })).toBeNull();
    expect(await screen.findByText('Daha fazla kayıt var; aramayı daraltın.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /UE-ORN-0011/ }));
    expect(await screen.findByRole('region', { name: 'Çizim ve 3B' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Sipariş ve proje klasörü' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Kayda git/ }).getAttribute('href')).toBe('/uretim-emirleri/11');
    expect(screen.getByRole('link', { name: /Sipariş klasörü/ }).getAttribute('href')).toBe('/ortak-dosyalar?klasor=3');
    expect(screen.getByText(/Liste uzun/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Sipariş ve proje klasörü 1/ }));
    expect(screen.queryByRole('region', { name: 'Çizim ve 3B' })).toBeNull();
  });

  it('PDF önizlemesi kaynağın ucundan okunur; tarayıcıda gösterilmeyen tür indirmeye yönlendirir', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:orn'), revokeObjectURL: vi.fn() }));
    sunucuKur(['sayfa.ortak-dosyalar', 'sayfa.uretim-emirleri']);
    ciz('/ortak-dosyalar/hazir/uretim-emri?kayit=11');
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-flans-r2.pdf önizle' }));
    const cekmece = await screen.findByRole('complementary', { name: 'ORN-flans-r2.pdf önizleme' });
    await waitFor(() => expect(within(cekmece).getByTitle('ORN-flans-r2.pdf')).toBeTruthy());
    expect(ikiliOku).toHaveBeenCalledWith('/cizimler/5/revizyonlar/9/dosya', expect.anything());
    expect(within(cekmece).getByRole('link', { name: /Çizim Merkezi'nde aç/ }).getAttribute('href')).toBe('/cizimler/belge/5');
    fireEvent.click(screen.getByRole('button', { name: 'ORN-olcu.xlsx önizle' }));
    expect(await screen.findByText('Bu tür tarayıcıda gösterilmez; indirip açın.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Önizlemeyi kapat' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('listeyi okuyamayan menüde görmez', async () => {
    const yollar = sunucuKur(['sayfa.ortak-dosyalar']);
    ciz('/ortak-dosyalar/hazir/uretim-emri');
    await screen.findByRole('button', { name: /UE-ORN-0011/ });
    await waitFor(() => expect(yollar).toContain('/oturum'));
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByRole('navigation', { name: 'Hazır listeler' })).toBeNull();
  });
});
