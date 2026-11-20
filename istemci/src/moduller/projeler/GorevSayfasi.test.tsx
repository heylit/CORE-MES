import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Gorev, GorevAyrintisiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GorevSayfasi } from './GorevSayfasi.tsx';

const YAPAN: Kullanici = { id: 9, ad: 'Deneme Yapan', islemler: ['sayfa.proje-gorevlerim', 'projeler.gorev-isle'] };

const gorev = (ek: Partial<Gorev>): Gorev => ({
  id: 7, kilometreTasiId: null, ad: 'Fikstür hazırlığı', aciklama: 'Deneme açıklaması', sorumluKisiId: 9, sorumluAd: 'Deneme Yapan',
  planBaslangic: '2026-12-01', planBitis: '2099-12-03', gercekBaslangic: '2026-12-01', gercekBitis: null, ilerleme: 50, durum: 'suruyor',
  oncekiGorevId: null, asama: null, yapanRolId: null, yapanRolAd: null, kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: 2,
  kontrolRolAd: 'Kalite', yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null, yedekKontrolRolAd: null, onaylandi: false, hazirlikMaddesi: null,
  kanitZorunlu: false, adimToplam: 2, adimYapilan: 1, surum: 4, ...ek,
});
const ayrinti = (g: Gorev, ek: Partial<GorevAyrintisiCevabi> = {}): GorevAyrintisiCevabi => ({
  gorev: g, proje: { id: 1, kod: 'PRJ.01', ad: 'Deneme projesi' },
  izinler: { ustlenebilir: false, baslayabilir: false, bitirebilir: true, onaylayabilir: false },
  olaylar: [{ olay: 'basla', kisiAd: 'Deneme Yapan', gerekce: null, an: '2026-12-01T09:00:00+03:00' }],
  adimlar: [
    { id: 1, ad: 'Çizimi oku', yapildi: true, yapanAd: 'Deneme Yapan', an: '2026-12-01T10:00:00+03:00' },
    { id: 2, ad: 'Bağlama aparatını hazırla', yapildi: false, yapanAd: null, an: null },
  ],
  notlar: [{ id: 1, kisiAd: 'Deneme Kontrolcü', metin: 'Deneme notu', an: '2026-12-01T11:00:00+03:00' }],
  kanitlar: [],
  icerikIzinleri: { adimIsaretler: true, adimYazar: true, kanitEkler: true, notYazar: true },
  ...ek,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function sunucuKur(ilk: GorevAyrintisiCevabi) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: YAPAN } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/gorevler/7/ayrinti') return json(200, ilk);
    if (yontem === 'POST' && yol.startsWith('/projeler/gorevler/7/')) return json(200, ilk);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/proje-gorevlerim/7']}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes><Route path="/proje-gorevlerim/:gorevId" element={<GorevSayfasi />} /></Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const postlar = (c: Cagri[]) => c.filter((x) => x.yontem === 'POST');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3458 görev sayfası', () => {
  it('adım işaretlenir ve eklenir; işaretli adımda kim ve ne zaman görünür, silme yalnız açık adımda', async () => {
    const cagrilar = sunucuKur(ayrinti(gorev({})));
    ac();
    const liste = await screen.findByRole('list', { name: 'Yapılacaklar' });
    expect(within(liste).getByText(/Deneme Yapan · 01\.12\.2026 10:00/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Çizimi oku: adımı sil' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bağlama aparatını hazırla: adımı sil' })).toBeTruthy();
    expect(screen.getByText('1/2 · %50')).toBeTruthy();
    fireEvent.click(within(liste).getByRole('checkbox', { name: 'Bağlama aparatını hazırla' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/projeler/gorevler/7/adimlar/2/isaretle', govde: { yapildi: true } });
    fireEvent.change(screen.getByLabelText('Yeni adım'), { target: { value: '  Ölçü kontrolü ' } });
    fireEvent.click(screen.getByRole('button', { name: /Adım ekle/ }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(2); });
    expect(postlar(cagrilar)[1]).toMatchObject({ yol: '/projeler/gorevler/7/adimlar', govde: { ad: 'Ölçü kontrolü' } });
  });

  it('açık adımla Bitti önce onay sorar; Vazgeç yazmaz, onay sürümle bitirir', async () => {
    const cagrilar = sunucuKur(ayrinti(gorev({})));
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Bitti, kontrole gönder' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText('1 adım işaretlenmedi')).toBeTruthy();
    expect(within(pencere).getByText('Bağlama aparatını hazırla')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    expect(postlar(cagrilar)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Bitti, kontrole gönder' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'İşaretle ve gönder' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/projeler/gorevler/7/bitir', govde: { surum: 4 } });
  });

  it('kanıt zorunlu ve kanıt yoksa Bitti kapalıdır ve nedeni yazar', async () => {
    sunucuKur(ayrinti(gorev({ kanitZorunlu: true, adimToplam: 0, adimYapilan: 0 }), { adimlar: [] }));
    ac();
    const bitti = await screen.findByRole('button', { name: 'Bitti, kontrole gönder' });
    expect((bitti as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toMatch(/kanıt ister/);
  });

  it('kanıt kaldırma onay sorar ve özetle gider; izni olmayan kaldırma ve ekleme görmez', async () => {
    const kanit = { ozet: 'a'.repeat(64), ad: 'olcum.pdf', boyut: 1200, tur: 'pdf', ekleyenAd: 'Deneme Yapan', zaman: '2026-12-01T12:00:00+03:00' };
    const cagrilar = sunucuKur(ayrinti(gorev({}), { kanitlar: [kanit] }));
    ac();
    const kanitlar = await screen.findByRole('list', { name: 'Kanıtlar' });
    expect(within(kanitlar).getByRole('link').getAttribute('href')).toBe(`/api/projeler/gorevler/7/kanitlar/${kanit.ozet}/dosya`);
    fireEvent.click(screen.getByRole('button', { name: 'olcum.pdf: kanıtı kaldır' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]?.yol).toBe(`/projeler/gorevler/7/kanitlar/${kanit.ozet}/kaldir`);
  });

  it('içerik izni yoksa adım, kanıt düğmeleri görünmez; not yazılabilir', async () => {
    const cagrilar = sunucuKur(ayrinti(gorev({}), { icerikIzinleri: { adimIsaretler: false, adimYazar: false, kanitEkler: false, notYazar: true } }));
    ac();
    const liste = await screen.findByRole('list', { name: 'Yapılacaklar' });
    expect((within(liste).getByRole('checkbox', { name: 'Bağlama aparatını hazırla' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Yeni adım')).toBeNull();
    expect(screen.queryByRole('button', { name: /Fotoğraf ya da PDF ekle/ })).toBeNull();
    expect(screen.getByText(/Deneme notu/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Not'), { target: { value: 'Malzeme geldi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Notu ekle' }));
    await waitFor(() => { expect(postlar(cagrilar)).toHaveLength(1); });
    expect(postlar(cagrilar)[0]).toMatchObject({ yol: '/projeler/gorevler/7/notlar', govde: { metin: 'Malzeme geldi' } });
  });
});
