import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MalzemeIstegi, TeslimLotlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { cihazTercihleriniSifirla } from '../../ortak/veri/cihaz-tercihi.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { TeslimPenceresi } from './TeslimPenceresi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); cihazTercihleriniSifirla(); try { localStorage.clear(); } catch { /* yok */ } });

const ISTEK: MalzemeIstegi = {
  id: 31, no: 'MI-ORN-0031', kaynakKimligi: 'k', malzemeId: 12, malzemeAd: 'Örnek çelik çubuk', miktar: '6.000', karsilanan: null, istasyonId: 4, istasyonAd: 'Örnek torna',
  uretimEmriId: null, aciklama: null, durum: 'acik', acilis: '2026-11-13T08:00:00Z', guncelleme: '2026-11-13T08:00:00Z', kisiAd: 'Örnek kişi', kapatanKisiAd: null, surum: 1,
  toplamaId: null, toplamaNo: null, yoldaTeslim: null,
};
const lot = (id: number, partiId: number, miktar: string, onerilen: string | null, sonKullanma: string | null = null) => ({
  bakiyeId: id, konumId: 100 + id, konumKod: `ORN-A0${String(id)}`, partiId, partiEtiketi: `ORN-L-000${String(id)}`, miktar, ilkGiris: `2026-09-1${String(id)}T08:00:00Z`, sonKullanma, onerilen,
});
const LOTLAR: TeslimLotlariCevabi = { veriYetersiz: false, yeterli: true, mevcut: '22.000', lotlar: [lot(1, 501, '4.000', '4.000'), lot(2, 502, '8.000', '2.000'), lot(3, 503, '10.000', null)] };
const LIFO: TeslimLotlariCevabi = { ...LOTLAR, lotlar: [lot(3, 503, '10.000', '6.000'), lot(2, 502, '8.000', null), lot(1, 501, '4.000', null)] };

function kur(yollar: Parameters<typeof sunucuKur>[1] = {}) {
  const istekler = sunucuKur(DEPOCU, {
    'GET /stok/malzemeler/12/teslim-lotlari': () => json(200, LOTLAR),
    'GET /stok/malzemeler/12/ozet': () => json(200, { ozet: { id: 12, tur: 'hammadde', kod: 'ORN-HM-0012', ad: 'Örnek çelik çubuk', onayDurumu: 'aktif', kullanilabilir: true, birim: 'boy' } }),
    ...yollar,
  });
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const elle = vi.fn();
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><TeslimPenceresi istek={ISTEK} kapat={() => undefined} elle={elle} /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return { istekler, elle };
}
const okut = (kod: string) => { for (const key of [...kod, 'Enter']) fireEvent.keyDown(document.body, { key }); };
const teslimDugmesi = () => screen.getByRole('button', { name: /Teslim et/ });

describe('teslim penceresi (3187 a, 3191 a)', () => {
  it('oneri hazir gelir; okutulan lot onaylanir, okutulmayan elle onaylanir; iki parca tek komutla gider', async () => {
    const { istekler } = kur({
      'GET /stok/teslim-kutusu/kod-coz': () => json(200, { tur: 'malzeme', malzeme: { id: 12, kod: 'ORN-HM-0012', ad: 'Örnek çelik çubuk', birim: 'boy' }, parti: { id: 501, etiket: 'ORN-L-0001' }, yerler: [] }),
      'POST /stok/malzeme-istekleri/31/lotlarla-gonder': () => json(200, { teslim: { id: 1, no: 'TS-ORN-1' }, ekTeslimler: [{ id: 2, no: 'TS-ORN-2' }] }),
    });
    const oneri = await screen.findByRole('list', { name: 'Teslim önerisi' });
    expect(within(oneri).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Teslim önerisi · FIFO')).toBeTruthy();
    expect(teslimDugmesi().textContent).toContain('6 boy');
    okut('LOC:ORN-A01');
    expect((await screen.findByRole('alert')).textContent).toMatch(/konum etiketi/);
    okut('LOT:ORN-L-0001');
    expect(await screen.findByText(/ORN-L-0001 doğru\. Sıradaki: ORN-A02 · ORN-L-0002/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(oneri).getByRole('button', { name: /ORN-A02/ }));
    expect(screen.getByText('2 / 2 lot onaylı')).toBeTruthy();
    fireEvent.click(teslimDugmesi());
    expect(await screen.findByText('MI-ORN-0031 yola çıktı')).toBeTruthy();
    const gonderilen = istekler.find((i) => i.yol === '/stok/malzeme-istekleri/31/lotlarla-gonder')!.govde as { parcalar: unknown[] };
    expect(gonderilen.parcalar).toEqual([
      { konumId: 101, partiId: 501, miktar: '4.000', okutuldu: true },
      { konumId: 102, partiId: 502, miktar: '2.000', okutuldu: false },
    ]);
    expect(screen.getByText(/okutulmadı/)).toBeTruthy();
  });

  it('yanlis okutma soylenir: konum etiketi, baska malzeme; oneride olmayan lot uyarir ama alinir', async () => {
    let cozum: unknown = { tur: 'malzeme', malzeme: { id: 99, kod: 'ORN-HM-0099', ad: 'Başka malzeme', birim: 'kg' }, parti: { id: 900, etiket: 'ORN-L-0900' }, yerler: [] };
    kur({ 'GET /stok/teslim-kutusu/kod-coz': () => json(200, cozum) });
    await screen.findByRole('list', { name: 'Teslim önerisi' });
    okut('LOC:ORN-A01');
    expect((await screen.findByRole('alert')).textContent).toMatch(/konum etiketi/);
    okut('LOT:ORN-L-0900');
    expect((await screen.findByRole('alert')).textContent).toMatch(/başka malzemenin: Başka malzeme/);
    cozum = { tur: 'malzeme', malzeme: { id: 12, kod: 'ORN-HM-0012', ad: 'Örnek çelik çubuk', birim: 'boy' }, parti: { id: 503, etiket: 'ORN-L-0003' }, yerler: [] };
    okut('LOT:ORN-L-0003');
    expect(await screen.findByText(/ORN-L-0003 alındı ama öneride değil: FIFO sırasında önce ORN-L-0001/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Teslim önerisi' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('hizli liste butun lotlari gosterir, secim cihazda hatirlanir; sira degisince oneri yeniden kurulur', async () => {
    const { istekler } = kur({ 'GET /stok/malzemeler/12/teslim-lotlari': () => json(200, LOTLAR) });
    await screen.findByRole('list', { name: 'Teslim önerisi' });
    fireEvent.click(screen.getByRole('button', { name: 'Hızlı liste' }));
    const liste = screen.getByRole('list', { name: 'Verilebilir lotlar' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Hızlı liste' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    vi.unstubAllGlobals();
    kur({ 'GET /stok/malzemeler/12/teslim-lotlari': (/* sira lifo */) => json(200, LIFO) });
    expect(await screen.findByRole('list', { name: 'Verilebilir lotlar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'LIFO' }));
    await waitFor(() => expect(teslimDugmesi().textContent).toContain('6 boy'));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Verilebilir lotlar' })).getAllByRole('listitem')[0]!.getAttribute('data-secili')).toBe(''));
    expect(istekler.length).toBeGreaterThan(0);
  });

  it('sepete at: lotlar istasyon hedefiyle sepete girer, teslim komutu gitmez', async () => {
    const { istekler } = kur({ 'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] }) });
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Teslim önerisi' })).getAllByRole('listitem')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Sepete at' }));
    expect(await screen.findByText('Sepetinize eklendi')).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/stok/sepet/satir-ekle').map((i) => i.govde)).toEqual([
      { malzemeId: 12, miktar: '4.000', kaynakKonumId: 101, partiId: 501, hedef: { istasyonId: 4 } },
      { malzemeId: 12, miktar: '2.000', kaynakKonumId: 102, partiId: 502, hedef: { istasyonId: 4 } },
    ]);
    expect(istekler.some((i) => i.yol.includes('lotlarla-gonder'))).toBe(false);
  });

  it('serbest stok yoksa bos durum ve elle secim yolu', async () => {
    const { elle } = kur({ 'GET /stok/malzemeler/12/teslim-lotlari': () => json(200, { veriYetersiz: true, yeterli: false, mevcut: '0', lotlar: [] }) });
    expect(await screen.findByText(/verilebilir serbest stoğu yok/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Konumu elle seç' }));
    expect(elle).toHaveBeenCalled();
  });
});
