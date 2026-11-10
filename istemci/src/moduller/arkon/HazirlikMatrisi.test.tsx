import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { AdimliEmirOzeti, HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { HazirlikMatrisi, matrisSatirlari } from './HazirlikMatrisi.tsx';

// 2227e: açık emirlerin hazırlık matrisi (satır emir × operasyon). Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KISI: Kullanici = { id: 4, ad: 'Deneme Hazirlik', islemler: ['sayfa.arkon', 'arkon.hazirlik', 'sayfa.uretim-emirleri'] };

// Sayfanın okumadığı alanlar boş bırakılır.
const emir = (id: number, durum: AdimliEmirOzeti['durum'], teslim: string | null, arsiv = false): AdimliEmirOzeti => ({
  id, emirNo: `UE-DNM-${String(id)}`, urun: { id: 500 + id, kod: `DNM-${String(id)}`, ad: `Deneme parça ${String(id)}` }, adet: 10, oncelik: 2,
  baslangic: null, teslim, durum, arsiv, kaynakRotaRevizyonId: null,
} as AdimliEmirOzeti);
const m = (madde: HazirlikCevabi['maddeler'][number]['madde'], durum: HazirlikCevabi['maddeler'][number]['durum'], isEmriDuzeyi: boolean) =>
  ({ madde, durum, muafTutulur: madde === 'cnc', isEmriDuzeyi });
const hazirlik = (cnc: [string, string], talimat: string): HazirlikCevabi => ({
  maddeler: [m('cnc', 'eksik', true), m('cizim', 'tamam', false), m('talimat', 'eksik', true)],
  muafiyetler: [],
  isEmirleri: [
    { isEmriId: 11, opNo: 10, ad: 'Tornalama', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc[0] as 'tamam' }, { madde: 'talimat', durum: talimat as 'tamam' }] },
    { isEmriId: 12, opNo: 20, ad: 'Frezeleme', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc[1] as 'tamam' }, { madde: 'talimat', durum: 'tamam' }] },
    { isEmriId: 13, opNo: 30, ad: 'Taşlama', bitti: true, maddeler: [{ madde: 'cnc', durum: 'eksik' }, { madde: 'talimat', durum: 'eksik' }] },
  ],
});

describe('Hazırlık matrisi sayfası (2227e)', () => {
  it('satır açık iş emri başınadır; durduran eksik durur, yalnız uyaran eksik uyarıyla başlar; bitmiş iş emri yoktur', () => {
    const s = matrisSatirlari([emir(1, 'planli', null)], new Map([[1, hazirlik(['tamam', 'eksik'], 'eksik')]]));
    expect(s.map((x) => [x.isEmri?.opNo, x.durum, x.hal.get('cnc'), x.hal.get('cizim')])).toEqual([
      [10, 'uyari', 'tamam', 'tamam'],
      [20, 'durur', 'eksik', 'tamam'],
    ]);
    const rotasiz = matrisSatirlari([emir(2, 'planli', null)], new Map([[2, { ...hazirlik(['tamam', 'tamam'], 'tamam'), isEmirleri: [] }]]));
    expect(rotasiz.map((x) => [x.isEmri, x.hal.get('cnc')])).toEqual([[null, 'eksik']]);
  });

  it('açık emirleri teslime göre listeler; süzgeç ve arama satırları daraltır; arşiv ve bitmiş emir sorulmaz', async () => {
    const sorulan: string[] = [];
    const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = adres.replace('/api', '');
      if (yol === '/oturum') return json({ kullanici: KISI });
      if (yol === '/adimli-emirler') return json({ emirler: [emir(1, 'planli', '2026-12-01'), emir(2, 'basladi', '2026-11-20'), emir(3, 'bitti', null), emir(4, 'planli', null, true)] });
      if (yol.startsWith('/adimli-emirler/hazirlik-ozeti')) {
        sorulan.push(yol);
        return json({ emirler: [{ emirId: 1, hazirlik: hazirlik(['tamam', 'eksik'], 'eksik') }, { emirId: 2, hazirlik: hazirlik(['tamam', 'tamam'], 'tamam') }] });
      }
      return new Response('{}', { status: 404 });
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici><MemoryRouter><HazirlikMatrisi /></MemoryRouter></BildirimSaglayici>
      </QueryClientProvider>,
    );
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(sorulan).toEqual(['/adimli-emirler/hazirlik-ozeti?emirler=2,1']);
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((r) => within(r).getByRole('link').textContent)).toEqual(['UE-DNM-2', 'UE-DNM-2', 'UE-DNM-1', 'UE-DNM-1']);
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Emir · operasyon', 'Teslim', 'Hazırlık', 'CNCdurdurur', 'Çizimdurdurur', 'Talimatuyarır']);
    expect(screen.getByText('1 durur')).toBeTruthy();
    expect(screen.getByText('1 uyarıyla başlar')).toBeTruthy();
    expect(screen.getByText('2 hazır')).toBeTruthy();
    expect(within(satirlar[3]!).getByTitle('CNC kurulumu: Eksik · sorumlu CNC Kurulum')).toBeTruthy();
    expect(within(satirlar[2]!).getByTitle('Hazırlık talimatı: Uyarı · sorumlu Terminal')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'parça 1' } });
    expect(within(tablo).getAllByRole('row').slice(1)).toHaveLength(2);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hazırlık' }), { target: { value: 'durur' } });
    expect(within(tablo).getAllByRole('row').slice(1).map((r) => within(r).getByRole('link').textContent)).toEqual(['UE-DNM-1']);
  });

  it('sayısı sıfır olan özet rozeti çizilmez', async () => {
    const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      const yol = adres.replace('/api', '');
      if (yol === '/oturum') return json({ kullanici: KISI });
      if (yol === '/adimli-emirler') return json({ emirler: [emir(2, 'basladi', '2026-11-20')] });
      if (yol.startsWith('/adimli-emirler/hazirlik-ozeti')) return json({ emirler: [{ emirId: 2, hazirlik: hazirlik(['tamam', 'tamam'], 'tamam') }] });
      return new Response('{}', { status: 404 });
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BildirimSaglayici><MemoryRouter><HazirlikMatrisi /></MemoryRouter></BildirimSaglayici>
      </QueryClientProvider>,
    );
    const ozet = await screen.findByRole('list', { name: 'Hazırlık özeti' });
    expect(within(ozet).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['2 hazır']);
  });
});
