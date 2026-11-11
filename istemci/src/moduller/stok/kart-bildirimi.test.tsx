import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { AcilanKart, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useAcilanKartBildirimi, useKartBildirimi, type KartTeslimi } from './kart-bildirimi.tsx';
import { DEPOCU, OKUYUCU, json, sunucuKur } from './test-ortak.tsx';

// 2931 a, 2944: kart sunucuda açılır, kâğıt kendiliğinden basılmaz; bildirim kartı söyler, düğme Etiket Merkezi'ni o kart seçili açar.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const MERKEZLI: Kullanici = { ...DEPOCU, islemler: [...DEPOCU.islemler, 'sayfa.etiket-merkezi'] };
const KART: RefakatPartisi = {
  id: 51, qr: 'RP:51', etiket: 'UE-000077-P1', uretimEmriId: 77, emirNo: 'UE-000077', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'adet',
  partiId: 8, lotNo: 'LT-8', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, lotaBaglanmaZamani: null, verilen: '3', durum: 'acik', surum: 1,
  kayitZamani: '2026-11-11T08:00:00Z', ust: null, birlestigi: null, birlesmeZamani: null,
};
const BASKA_LOT: RefakatPartisi = { ...KART, id: 50, etiket: 'UE-000077-P2', sira: 2, partiId: 9 };
const ISTISNA: RefakatPartisi = { ...KART, id: 60, etiket: 'UE-000077-P3', sira: 3, partiId: null, lotNo: null };

function Adres() { return <p data-testid="adres">{useLocation().pathname + useLocation().search}</p>; }

function DepoTeslimi({ t }: { t: KartTeslimi }) {
  const soyle = useKartBildirimi();
  // Oturum gelmeden basılırsa sayfa izni henüz bilinmez; düğme oturumla çıkar.
  if (!useOturum().data) return null;
  return <button type="button" onClick={() => { void soyle(t); }}>Teslim</button>;
}
function Gonderim({ kartlar = [{ id: 51, etiket: 'UE-000077-P1' }] }: { kartlar?: AcilanKart[] }) {
  const soyle = useAcilanKartBildirimi('gidiyor');
  if (!useOturum().data) return null;
  return <button type="button" onClick={() => soyle(kartlar)}>Gönder</button>;
}

function ciz(ogesi: ReactNode, yonlendiricili = true) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ic = <BildirimSaglayici>{ogesi}</BildirimSaglayici>;
  render(
    <QueryClientProvider client={istemci}>
      {yonlendiricili ? (
        <MemoryRouter initialEntries={['/stok/hazirlik']}>
          <Routes><Route path="*" element={<><Adres />{ic}</>} /></Routes>
        </MemoryRouter>
      ) : ic}
    </QueryClientProvider>,
  );
}

describe('refakat kartı bildirimi', () => {
  it('depo teslimi lotun açık kartını söyler; düğme kart kimliğiyle (lot kimliği değil) Etiket Merkezi\'ni açar', async () => {
    sunucuKur(MERKEZLI, { 'GET /stok/uretim-emirleri/77/refakat-partileri': () => json(200, { partiler: [BASKA_LOT, KART, ISTISNA] }) });
    ciz(<DepoTeslimi t={{ uretimEmriId: 77, partiId: 8, malzemeId: 901 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teslim' }));
    expect(await screen.findByText("Refakat kartı UE-000077-P1 bu teslimle gidiyor; kâğıdı Etiket Merkezi'nden basın.")).toBeTruthy();
    expect(screen.queryByText(/UE-000077-P2|UE-000077-P3/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Etiketlere git' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/etiket-merkezi?tur=refakat-partisi&id=51'));
  });

  it('lotsuz teslimde aynı malzemenin istisna kartı söylenir', async () => {
    sunucuKur(MERKEZLI, { 'GET /stok/uretim-emirleri/77/refakat-partileri': () => json(200, { partiler: [KART, ISTISNA] }) });
    ciz(<DepoTeslimi t={{ uretimEmriId: 77, partiId: null, malzemeId: 901 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teslim' }));
    expect(await screen.findByText(/Refakat kartı UE-000077-P3 bu teslimle gidiyor/)).toBeTruthy();
    expect(screen.queryByText(/UE-000077-P1/)).toBeNull();
  });

  it('Etiket Merkezi\'ni göremeyene basan rol adıyla söylenir, düğme yoktur (yasak)', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/uretim-emirleri/77/refakat-partileri': () => json(200, { partiler: [KART] }) });
    ciz(<DepoTeslimi t={{ uretimEmriId: 77, partiId: 8, malzemeId: 901 }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teslim' }));
    expect(await screen.findByText('Refakat kartı UE-000077-P1 bu teslimle gidiyor; kâğıdı Depo ya da Vardiya Sorumlusu basar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Etiketlere git' })).toBeNull();
  });

  it('istasyon gönderimi cevaptaki açılan kartı söyler; kart okuması yapılmaz', async () => {
    const istekler = sunucuKur(MERKEZLI, {});
    ciz(<Gonderim />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText("Refakat kartı UE-000077-P1 açıldı ve bu teslimle gidiyor; kâğıdı Etiket Merkezi'nden basın.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Etiketlere git' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/etiket-merkezi?tur=refakat-partisi&id=51'));
    expect(istekler.some((i) => i.yol.includes('refakat-partileri'))).toBe(false);
  });

  it('çok parçalı gönderimde açılan kartlar tek iletide söylenir; düğme hepsini seçili açar', async () => {
    sunucuKur(MERKEZLI, {});
    ciz(<Gonderim kartlar={[{ id: 51, etiket: 'UE-000077-P1' }, { id: 52, etiket: 'UE-000077-P2' }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText("Refakat kartları UE-000077-P1, UE-000077-P2 açıldı ve bu teslimle gidiyor; kâğıdı Etiket Merkezi'nden basın.")).toBeTruthy();
    expect(screen.getAllByText(/UE-000077-P1/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Etiketlere git' }));
    await waitFor(() => expect(screen.getByTestId('adres').textContent).toBe('/etiket-merkezi?tur=refakat-partisi&id=51,52'));
  });

  it('kart açılmadıysa ileti çıkmaz', async () => {
    sunucuKur(MERKEZLI, {});
    ciz(<Gonderim kartlar={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText(/Refakat kart/)).toBeNull();
  });

  it('yönlendiricisiz çizimde ileti çıkar, düğme çıkmaz', async () => {
    sunucuKur(MERKEZLI, {});
    ciz(<Gonderim />, false);
    fireEvent.click(await screen.findByRole('button', { name: 'Gönder' }));
    expect(await screen.findByText(/UE-000077-P1 açıldı ve bu teslimle gidiyor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Etiketlere git' })).toBeNull();
  });
});
