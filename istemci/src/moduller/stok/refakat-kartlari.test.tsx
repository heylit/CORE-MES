import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RefakatKartlariSatiri, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { ac, json, OKUYUCU, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const satir = (r: RefakatPartisi, urun = { kod: 'P-1', ad: 'Deneme mil' }): RefakatKartlariSatiri => ({ refakat: r, urun, adet: 10, teslim: '2026-10-30', adimSayisi: 3 });
const LISTE = [
  satir(KART),
  satir({ ...KART, id: 13, qr: 'RP:13', etiket: 'UE-000002-P1', uretimEmriId: 2, emirNo: 'UE-000002', lotNo: null, partiId: null, verilen: '0' }, { kod: 'P-2', ad: 'Deneme flanş' }),
  satir({ ...KART, id: 14, qr: 'RP:14', etiket: 'UE-000001-P2', sira: 2, birlestigi: { id: 12, etiket: 'UE-000001-P1' } }),
];
const BAS = { emirId: 1, qr: 'UE:1', emirNo: 'UE-000001', urun: { kod: 'P-1', ad: 'Deneme mil' }, adet: 10, teslim: null, parti: { ustEmirNo: null, bolunmeSira: null }, adimlar: [] };

describe('Refakat kartları sayfası (kart #708)', () => {
  it('menüden açılır; kartları durumuyla listeler, aramada süzer, tümü süzgeci iptali de ister, kart adı kartın penceresini açar', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /stok/refakat-kartlari': () => json(200, { kartlar: LISTE, sinirda: false }),
      'GET /stok/refakat-partileri/12/kart': () => json(200, { refakat: KART, kart: BAS }),
      'GET /stok/refakat-partileri/12/iz': () => json(200, { refakat: KART, ustler: [], altlar: [], birlesenler: [], ayniLot: [], ciktilar: [], sevkler: [] }),
    });
    ac('/stok/refakat-kartlari');
    const tablo = await screen.findByRole('table', { name: 'Refakat kartları' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((s) => within(s).getAllByRole('cell').at(-1)?.textContent)).toEqual(['Açık', 'Lot bekliyor', 'UE-000001-P1 kartına birleşti']);
    expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=acik')).toBe(true);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'FLANŞ' } });
    await waitFor(() => expect(within(tablo).getAllByRole('row')).toHaveLength(2));
    expect(within(tablo).getByRole('button', { name: 'UE-000002-P1' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'LT-000040' } });
    await waitFor(() => expect(within(tablo).getAllByRole('row')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/refakat-kartlari?durum=tumu')).toBe(true));

    fireEvent.click(await screen.findByRole('button', { name: 'UE-000001-P1' }));
    expect(await screen.findByRole('dialog', { name: 'Refakat kartı UE-000001-P1' })).toBeTruthy();
  });

  it('liste sınıra dayanınca söyler; kart yoksa boş der', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/refakat-kartlari': () => json(200, { kartlar: [], sinirda: true }) });
    ac('/stok/refakat-kartlari');
    expect(await screen.findByText(/Yalnız en yeni kartlar gösteriliyor/)).toBeTruthy();
    expect(screen.getByText('Kart yok.')).toBeTruthy();
  });
});
