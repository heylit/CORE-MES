import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  Proje, ProjeSiparisKalemleriCevabi, ProjeYonetimiCevabi, SiparisSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import type { AdimliEmirOzeti, AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { ProjeFormu } from './ProjeFormu.tsx';

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.projeler', 'projeler.yaz', 'sayfa.uretim-emirleri'] };
const OKUR: Kullanici = { id: 2, ad: 'Deneme Okur', islemler: ['sayfa.projeler'] };

const proje = (ek: Partial<Proje>): Proje => ({
  id: 1, kod: 'ORN.01', ad: 'Deneme projesi', durum: 'aktif', firmaId: 7, firmaAd: 'ORN Müşteri', siparisId: 21, baslangic: null,
  bitis: '2026-11-18', bitisBagli: false, aciklama: null, olusturma: '2026-10-12T09:00:00+03:00', guncelleme: null, surum: 3,
  statu: null, ilerleme: null, ...ek,
});
const KALEMLER = {
  siparisNo: 'SS-2026-0021',
  siparisTermini: '2026-11-15',
  kalemler: [
    {
      id: 41, sira: 1, malzemeNo: 5, malzemeKodu: 'ORN-MAMUL-1', malzemeAdi: 'Deneme mil', birim: 'adet', miktar: '100.000',
      termin: '2026-11-15', terminElle: false,
      partiler: [{ id: 1, emirTuru: 'fai', adet: '10.000' }, { id: 2, emirTuru: 'seri', adet: '90.000' }],
    },
    { id: 42, sira: 2, malzemeNo: 6, malzemeKodu: 'ORN-MAMUL-2', malzemeAdi: 'Deneme burç', birim: 'adet', miktar: '20.000', termin: '2026-11-25', terminElle: true, partiler: [] },
  ],
} satisfies ProjeSiparisKalemleriCevabi;
const emir = (id: number, emirNo: string, teslim: string): AdimliEmirOzeti => ({
  id, emirNo, urun: { id: 5, kod: 'ORN-MAMUL-1', ad: 'Deneme mil' }, adet: 10, oncelik: 2, baslangic: null, teslim,
  durum: 'planli', arsiv: false, kaynakRotaRevizyonId: null, adimSayisi: 3, tamamAdim: 0, siradaki: null, aciklama: null, surum: 1,
  acilma: '2026-10-12T09:00:00+03:00', projeId: 1, siparisSatiriId: 41, emirTuru: 'fai',
});
const EMIRLER = { emirler: [emir(11, 'ORN-EMR-11', '2026-11-15'), emir(12, 'ORN-EMR-12', '2026-11-10')] } satisfies AdimliListeCevabi;
const YONETIM = { statu: null, statuGecmisi: [], kilometreTaslari: [], gorevler: [], ilerleme: null, statuler: [], serbestStatu: true } satisfies ProjeYonetimiCevabi;
const SIPARISLER = { siparisler: [{ id: 21, no: 'SS-2026-0021', firmaAd: 'ORN Müşteri', termin: '2026-11-15' }] } satisfies SiparisSecenekleriCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, ilk: Proje) {
  let p = ilk;
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/1') return json(200, p);
    if (yontem === 'GET' && yol === '/projeler/1/yonetim') return json(200, YONETIM);
    if (yontem === 'GET' && yol === '/projeler/1/siparis-kalemleri') return json(200, KALEMLER);
    if (yontem === 'GET' && yol === '/adimli-emirler?projeId=1') return json(200, EMIRLER);
    if (yontem === 'GET' && yol.startsWith('/projeler/siparis-secenekleri')) return json(200, SIPARISLER);
    if (yontem === 'POST' && yol === '/projeler/1/bitis-bagla') {
      p = { ...p, bitis: '2026-11-15', bitisBagli: true, surum: p.surum + 1 };
      return json(200, p);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function sar(cocuk: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/projeler/1']}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes><Route path="/projeler/:id" element={cocuk} /></Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Projede sipariş kalemleri (3244)', () => {
  it('kalemler terminleri, partileri ve kalemden açılan emirleriyle görünür; termin dışı teslim işaretlenir', async () => {
    sunucuKur(YAZAR, proje({}));
    sar(<ProjeAyrinti />);
    fireEvent.click(await screen.findByRole('tab', { name: /Sipariş kalemleri/ }));
    const tablo = await screen.findByRole('table', { name: 'Projenin sipariş kalemleri' });
    expect(await within(tablo).findByText('10 FAI')).toBeTruthy();
    expect(within(tablo).getByText('90 Seri')).toBeTruthy();
    expect(within(tablo).getByText('Sipariş termini')).toBeTruthy();
    expect(within(tablo).getByText('Elle')).toBeTruthy();
    expect(await within(tablo).findByText('ORN-EMR-11')).toBeTruthy();
    expect(within(tablo).getAllByText('Teslim termin dışı')).toHaveLength(1);
    expect(within(tablo).getByText('Seri')).toBeTruthy();
  });

  it('elle değişmiş bitiş "Siparişe bağla" ile termine bağlanır; okuyan bağlayamaz', async () => {
    const cagrilar = sunucuKur(YAZAR, proje({}));
    sar(<ProjeAyrinti />);
    fireEvent.click(await screen.findByRole('tab', { name: /Sipariş kalemleri/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Siparişe bağla/ }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/projeler/1/bitis-bagla')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/projeler/1/bitis-bagla')?.govde).toEqual({ surum: 3 });
    expect(await screen.findByText('Sipariş terminine bağlı')).toBeTruthy();
    cleanup();
    sunucuKur(OKUR, proje({}));
    sar(<ProjeAyrinti />);
    fireEvent.click(await screen.findByRole('tab', { name: /Sipariş kalemleri/ }));
    await screen.findByRole('table', { name: 'Projenin sipariş kalemleri' });
    expect(screen.queryByRole('button', { name: /Siparişe bağla/ })).toBeNull();
    expect(screen.queryByText('ORN-EMR-11')).toBeNull();
  });

  it('siparişsiz projede sipariş kalemleri sekmesi yok', async () => {
    sunucuKur(YAZAR, proje({ siparisId: null }));
    sar(<ProjeAyrinti />);
    await screen.findByRole('tab', { name: /Özet/ });
    expect(screen.queryByRole('tab', { name: /Sipariş kalemleri/ })).toBeNull();
  });

  it('yeni projede sipariş seçilince bitiş sipariş termininden dolar', async () => {
    sunucuKur(YAZAR, proje({}));
    sar(<ProjeFormu proje={null} kapat={() => {}} />);
    const secim = await screen.findByLabelText(/^Sipariş/, { selector: 'select' });
    await within(secim).findByText(/SS-2026-0021/);
    fireEvent.change(secim, { target: { value: '21' } });
    expect((screen.getByLabelText('Bitiş') as HTMLInputElement).value).toBe('2026-11-15');
    expect(screen.getByText('Sipariş termininden; termin değişince bitiş de değişir.')).toBeTruthy();
  });
});
