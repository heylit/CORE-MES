import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GorevlerimCevabi, Proje, ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { Gorevler } from './Gorevler.tsx';

const OPERATOR: Kullanici = { id: 6, ad: 'Deneme Operatör', islemler: ['sayfa.proje-gorevlerim', 'projeler.gorev-isle'] };
const PLANLAMACI: Kullanici = { id: 3, ad: 'Deneme Planlamacı', islemler: ['sayfa.proje-gorevlerim', 'sayfa.projeler', 'projeler.gorev-yaz', 'projeler.sablon-yaz'] };

const proje = (id: number, kod: string, durum: Proje['durum'] = 'aktif'): Proje => ({
  id, kod, ad: `Deneme ${kod}`, durum, firmaId: null, firmaAd: null, firmaKodu: null, siparisId: null, baslangic: null, bitis: null, bitisBagli: false,
  aciklama: null, olusturma: '2026-10-12T09:00:00+03:00', guncelleme: null, surum: 1, statu: null, ilerleme: null,
});
const YONETIM: ProjeYonetimiCevabi = {
  statu: null, statuGecmisi: [], kilometreTaslari: [], ilerleme: null, statuler: [], serbestStatu: false,
  gorevler: [{
    id: 7, kilometreTasiId: null, ad: 'Fikstür tasarımı', aciklama: null, sorumluKisiId: null, sorumluAd: null,
    planBaslangic: '2026-10-01', planBitis: '2026-10-10', gercekBaslangic: null, gercekBitis: null, ilerleme: 0, durum: 'yapilacak',
    oncekiGorevId: null, asama: null, yapanRolId: null, yapanRolAd: null, kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: null,
    kontrolRolAd: null, yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null, yedekKontrolRolAd: null, onaylandi: false, hazirlikMaddesi: null,
    surum: 1,
  }],
};
const GOREVLERIM: GorevlerimCevabi = { gorevler: [] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/projeler/gorevlerim/liste') return json(200, GOREVLERIM);
    if (yol.startsWith('/projeler?')) return json(200, { satirlar: [proje(1, 'PRJ.01'), proje(2, 'PRJ.02')], toplam: 2, sayfa: 1, sayfaBoyu: 200 });
    if (yol === '/projeler/1') return json(200, proje(1, 'PRJ.01'));
    if (yol === '/projeler/2') return json(200, proje(2, 'PRJ.02'));
    if (yol === '/projeler/9') return json(200, proje(9, 'PRJ.09', 'tamamlandi'));
    if (/^\/projeler\/\d+\/yonetim$/.test(yol)) return json(200, YONETIM);
    if (yol.startsWith('/hazirlik-matrisi')) return json(200, { proje: { id: 1, kod: 'PRJ.01', ad: 'Deneme', durum: 'aktif' }, dagitir: false, maddeler: [], emirler: [], gorevler: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function Adres() {
  const k = useLocation();
  return <output aria-label="adres">{k.pathname + k.search}</output>;
}

function ac(adres = '/proje-gorevlerim') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes>
            <Route path="/proje-gorevlerim" element={<Gorevler />} />
            <Route path="/projeler/:id" element={<p>Proje ayrıntısı</p>} />
          </Routes>
          <Adres />
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Görevler sayfası (3444 a)', () => {
  it('projeyi okuyamayan yalnız kendi görevlerini görür; seçici yok, proje adresi yok sayılır, proje listesi istenmez', async () => {
    const yollar = sunucuKur(OPERATOR);
    ac('/proje-gorevlerim?proje=1');
    await screen.findByText('Sana düşen açık proje görevi yok');
    expect(screen.queryByLabelText('Gösterilen')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Gösterilen görevler' })).toBeNull();
    expect(yollar.some((y) => y.startsWith('/projeler?') || y.startsWith('/projeler/1'))).toBe(false);
  });

  it('seçicide önce Benim görevlerim, sonra aktif projeler; proje seçilince adres ve görünüm değişir', async () => {
    const yollar = sunucuKur(PLANLAMACI);
    ac();
    await screen.findByText('Sana düşen açık proje görevi yok');
    const secici = screen.getByLabelText('Gösterilen');
    await within(secici).findByRole('option', { name: 'PRJ.02 · Deneme PRJ.02' });
    expect(within(secici).getAllByRole('option').map((o) => o.textContent)).toEqual(['Benim görevlerim', 'PRJ.01 · Deneme PRJ.01', 'PRJ.02 · Deneme PRJ.02']);
    expect(yollar.find((y) => y.startsWith('/projeler?'))).toContain('durum=aktif');
    fireEvent.change(secici, { target: { value: '1' } });
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    expect(screen.getByLabelText('adres').textContent).toBe('/proje-gorevlerim?proje=1');
    expect(screen.getByRole('button', { name: /Görev ekle/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Gösterilen'), { target: { value: 'benim' } });
    await screen.findByText('Sana düşen açık proje görevi yok');
    expect(screen.getByLabelText('adres').textContent).toBe('/proje-gorevlerim');
  });

  it('sol listede aynı kapsamlar; seçili madde işaretli, tıklanınca proje açılır', async () => {
    sunucuKur(PLANLAMACI);
    ac();
    const liste = await screen.findByRole('navigation', { name: 'Gösterilen görevler' });
    const benim = within(liste).getByRole('button', { name: /^Benim görevlerim/ });
    await waitFor(() => { expect(benim.textContent).toBe('Benim görevlerim0'); });
    expect(benim.getAttribute('aria-current')).toBe('true');
    fireEvent.click(await within(liste).findByRole('button', { name: 'PRJ.02 · Deneme PRJ.02' }));
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    expect(screen.getByLabelText('adres').textContent).toBe('/proje-gorevlerim?proje=2');
    expect(within(liste).getByRole('button', { name: 'PRJ.02 · Deneme PRJ.02' }).getAttribute('aria-current')).toBe('true');
    expect(within(liste).getByRole('button', { name: /^Benim görevlerim/ }).getAttribute('aria-current')).toBeNull();
  });

  it('projeden açılınca başta projeye dönüş; kapalı proje de seçili görünür ve görev eklenmez', async () => {
    sunucuKur(PLANLAMACI);
    ac('/proje-gorevlerim?proje=9');
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    await waitFor(() => { expect((screen.getByLabelText('Gösterilen') as HTMLSelectElement).value).toBe('9'); });
    expect(screen.queryByRole('button', { name: /Görev ekle/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'PRJ.09' }));
    await screen.findByText('Proje ayrıntısı');
    expect(screen.getByLabelText('adres').textContent).toBe('/projeler/9');
  });
});
