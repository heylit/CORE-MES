import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { cihazYazicisiKaydet } from '../etiket-merkezi/disari.ts';
import { EtiketMerkeziDugmesi } from './Etiketler.tsx';
import { sunucuKur, json } from './test-ortak.tsx';

// 2916 a: varsayılan yazıcı bu cihazda tanımlıysa stok düğmesi Etiket Merkezi'ne gitmeden basar; yoksa ya da basma işlemi yoksa bugünkü gibi
// Etiket Merkezi'ni açar.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const BASAN: Kullanici = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.stok', 'sayfa.etiket-merkezi', 'etiket-merkezi.bas'] };
const GOREN: Kullanici = { id: 6, ad: 'Deneme Gören', islemler: ['sayfa.stok', 'sayfa.etiket-merkezi'] };
const LOT = { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' };

function Adres() { return <p data-testid="adres">{useLocation().pathname + useLocation().search}</p>; }

function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/stok']}>
          <Routes><Route path="*" element={<><Adres /><EtiketMerkeziDugmesi tur="mal-kabul" idler={[41]}>Lot etiketlerini bas</EtiketMerkeziDugmesi></>} /></Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

describe('stok etiket düğmesi, doğrudan basım', () => {
  it('varsayılan yazıcı varken Etiket Merkezi ucuna bu yazıcı ve kayıtla basar, sayfa değişmez', async () => {
    cihazYazicisiKaydet('lot', LOT);
    const istekler = sunucuKur(BASAN, { 'POST /etiket-merkezi/sablonlar/lot-100x50/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }) });
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Lot etiketlerini bas · Depo yazıcısı' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/etiket-merkezi/sablonlar/lot-100x50/bas')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ yaziciId: 3, adet: 1, kayit: { tur: 'mal-kabul', idler: [41] } });
    expect(await screen.findByText('Etiketler gönderildi: Depo yazıcısı.')).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/stok');
  });

  it('yazıcı hata verirse ileti Etiket Merkezi\'ni gösterir (reddedilen)', async () => {
    cihazYazicisiKaydet('lot', LOT);
    sunucuKur(BASAN, { 'POST /etiket-merkezi/sablonlar/lot-100x50/bas': () => json(200, { baskiId: 2, sonuc: 'hata', ileti: 'Yazıcıya ulaşılamadı.' }) });
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Lot etiketlerini bas · Depo yazıcısı' }));
    expect(await screen.findByText("Yazıcıya ulaşılamadı. Yazıcıyı kontrol edin ya da Etiket Merkezi'nden başka yazıcıya basın.")).toBeTruthy();
  });

  it('basma işlemi yoksa varsayılan olsa da Etiket Merkezi açılır, baskı isteği gitmez (yasak)', async () => {
    cihazYazicisiKaydet('lot', LOT);
    const istekler = sunucuKur(GOREN, {});
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Lot etiketlerini bas' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/etiket-merkezi?tur=mal-kabul&id=41'));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('varsayılan yoksa bugünkü gibi Etiket Merkezi açılır', async () => {
    sunucuKur(BASAN, {});
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Lot etiketlerini bas' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/etiket-merkezi?tur=mal-kabul&id=41'));
  });
});
