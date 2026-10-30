import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IstasyonSepetiSatiri, IstasyonSepetleriCevabi, Teslim } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { json, sunucuKur } from './test-ortak.tsx';
import { CikanSepet, IstasyonSepetleri, useIstasyonSepetiSayilari } from './disari.ts';

// Terminalin iki sepeti (745): gelen önceki istasyonun parçasını ve yoldaki teslimi, çıkan burada duran parçayı sonraki istasyonla gösterir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const uc = (konumId: number, kod: string, ad: string, istasyonId: number) => ({ konumId, kod, ad, istasyonId });
const YOLDA: Teslim = {
  id: 41, no: 'TS-000041', malzemeId: 901, malzemeAd: 'Deneme mil', miktar: '3.000', partiId: 4, statuId: 7,
  kaynak: uc(20, 'IST-1', 'Torna 1', 1), hedef: uc(21, 'IST-2', 'Freze 2', 2), uretimEmriId: 30, istekId: null, aciklama: null,
  durum: 'yolda', alinan: null, redNedeni: null, gonderenAd: 'Deneme Kişi', kapatanAd: null, aliciAd: null, gonderim: '2026-10-14T08:00:00+03:00', kapanis: null, surum: 1,
};
const SATIR: IstasyonSepetiSatiri = {
  malzemeId: 901, kod: 'YM-1', ad: 'Deneme mil', partiId: 4, partiEtiketi: 'EM-30', statuId: 7, miktar: '2.000', yolda: '0.000', uretimEmriId: 30,
  getiren: 'Deneme Kişi', gelis: '2026-10-14T07:00:00+03:00', koken: 'uretim', sonraki: { istasyonId: 3, kod: 'TS3', ad: 'Taşlama 3', opNo: 30 }, sonrakiYok: null,
};
const CEVAP: IstasyonSepetleriCevabi = {
  istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' },
  gelen: { bekleyen: [{ ...SATIR, miktar: '1.000', kaynak: { id: 1, kod: 'T1', ad: 'Torna 1' }, sonraki: { istasyonId: 2, kod: 'F2', ad: 'Freze 2', opNo: 20 } }], yolda: [YOLDA] },
  cikan: [SATIR],
};

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><IstasyonSepetleri istasyonId={2} uretimEmriId={30} /></BildirimSaglayici></QueryClientProvider>);
}

describe('iki sepet (745)', () => {
  it('gelen yoldaki teslimi ve önceki istasyonda bekleyeni, çıkan burada duranı sayıyla gösterir; tek okuma emirle', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, CEVAP),
      'GET /stok/statuler': () => json(200, { statuler: [] }),
    });
    ac();
    const gelen = await screen.findByRole('list', { name: 'Gelen' });
    expect(within(gelen).getAllByRole('listitem')).toHaveLength(2);
    expect(within(gelen).getByRole('button', { name: /Teslim al, 3/ })).toBeTruthy();
    expect(within(gelen).getByText(/Torna 1 \(T1\)/)).toBeTruthy();
    const cikan = screen.getByRole('list', { name: 'Çıkan' });
    expect(within(cikan).getByRole('button', { name: 'Sonraki istasyona: Taşlama 3 (OP 30)' })).toBeTruthy();
    expect(within(cikan).queryByRole('button', { name: 'Üretimde kullan' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu/istasyon-sepetleri?istasyonId=2&uretimEmriId=30')).toBe(true);
  });

  it('çıkandan gönderim emirle yazılır; önceki istasyondan çekme sepetten çek ucunu kullanır', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, CEVAP),
      'GET /stok/statuler': () => json(200, { statuler: [] }),
      'POST /stok/teslimler/gonder': () => json(200, { teslim: { ...YOLDA, id: 42 } }),
      'POST /stok/teslim-kutusu/sepet/cek': () => json(200, { teslim: { ...YOLDA, id: 43, durum: 'teslim' } }),
    });
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki istasyona: Taşlama 3 (OP 30)' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/teslimler/gonder')?.govde).toMatchObject({ uretimEmriId: 30, hedef: { istasyonId: 3 }, kaynak: { istasyonId: 2 }, statuId: 7 }));
    const gelen = screen.getByRole('list', { name: 'Gelen' });
    fireEvent.click(within(gelen).getByRole('button', { name: 'Teslim al, 1' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/teslim-kutusu/sepet/cek')?.govde).toMatchObject({ istasyonId: 2, kaynakIstasyonId: 1, malzemeId: 901, statuId: 7 }));
  });

  it('terminal çipinin sayısı aynı okumadan: gelen yoldaki ve bekleyen, çıkan duran satır; emir yoksa okunmaz', async () => {
    const istekler = sunucuKur(OPERATOR, { 'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, CEVAP) });
    function Sayi({ emir }: { emir: number | null }) {
      const s = useIstasyonSepetiSayilari(2, emir);
      return <p>{s === null ? 'yok' : `gelen ${s.gelen} cikan ${s.cikan}`}</p>;
    }
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={istemci}><Sayi emir={30} /><Sayi emir={null} /></QueryClientProvider>);
    expect(await screen.findByText('gelen 2 cikan 1')).toBeTruthy();
    expect(screen.getByText('yok')).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/stok/teslim-kutusu/istasyon-sepetleri'))).toHaveLength(1);
  });

  it('iki sepet boşsa ikisi de boş durumunu söyler', async () => {
    sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, { ...CEVAP, gelen: { bekleyen: [], yolda: [] }, cikan: [] }),
      'GET /stok/statuler': () => json(200, { statuler: [] }),
    });
    ac();
    expect(await screen.findByText('Önceki istasyondan bekleyen parça yok.')).toBeTruthy();
    expect(screen.getByText('Bu istasyonda bu emrin parçası yok.')).toBeTruthy();
  });
});

describe('çıkan sepet tek başına (1337 a)', () => {
  const tek = () => {
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={istemci}><BildirimSaglayici><CikanSepet istasyonId={2} uretimEmriId={30} /></BildirimSaglayici></QueryClientProvider>);
  };
  it('yalnız çıkanı gösterir; gönderim iki sepetteki gibi emirle yazılır', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, CEVAP),
      'GET /stok/statuler': () => json(200, { statuler: [] }),
      'POST /stok/teslimler/gonder': () => json(200, { teslim: { ...YOLDA, id: 42 } }),
    });
    tek();
    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki istasyona: Taşlama 3 (OP 30)' }));
    expect(screen.queryByRole('list', { name: 'Gelen' })).toBeNull();
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/teslimler/gonder')?.govde).toMatchObject({ uretimEmriId: 30, hedef: { istasyonId: 3 }, kaynak: { istasyonId: 2 } }));
  });
  it('çıkan boşsa gönderim düğmesi yok (reddedilen)', async () => {
    sunucuKur(OPERATOR, { 'GET /stok/teslim-kutusu/istasyon-sepetleri': () => json(200, { ...CEVAP, cikan: [] }), 'GET /stok/statuler': () => json(200, { statuler: [] }) });
    tek();
    expect(await screen.findByText('Bu istasyonda bu emrin parçası yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sonraki istasyona/ })).toBeNull();
  });
});
