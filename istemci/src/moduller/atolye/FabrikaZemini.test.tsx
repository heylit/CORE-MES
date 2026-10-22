import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FabrikaCevabi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { FabrikaZemini } from './disari.ts';

const bolum = (id: number, x: string, ekler: Partial<YerlesimCevabi> = {}): YerlesimCevabi => ({
  salon: {
    id, kod: `S${id}`, ad: `Deneme ${id}`, genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 1, fabrika: { x, z: '0.00', donus: '0.0' }, giris: null,
    kaydeden: { id: 1, ad: null }, kaydedildi: '', sutunlar: [], satirlar: [],
  },
  makineYerleri: [], istasyonYerleri: [], raflar: [], alanlar: [], duvarlar: [], gecisler: [],
  ...ekler,
});

const FABRIKA: FabrikaCevabi = {
  bolumler: [
    bolum(1, '0.00', {
      raflar: [{
        id: 5, kod: 'A1', ad: 'Palet', tur: 'palet', bolmeSayisi: 3, katSayisi: 2, gozSayisi: 1, bolmeGenisligi: '1.00', derinlik: '1.00', yukseklik: '2.00',
        x: '5.00', z: '5.00', donus: '0.0', aktif: true, genislik: '3.00', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null, hucre: 'A1',
      }],
    }),
    bolum(2, '30.00', {
      alanlar: [{ id: 7, tur: 'fason', ad: 'Fason kutusu', x: '4.00', z: '4.00', donus: '0.0', genislik: '2.00', derinlik: '1.00', kapi: null, hucre: 'A1' }],
    }),
  ],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FabrikaZemini (#114)', () => {
  it('bütün bölümler tek zeminde; rafa ve fason kutusuna basmak kayıtlı anahtarı verir, boşluk seçimi kaldırır', () => {
    const sec = vi.fn();
    const { container } = render(<FabrikaZemini fabrika={FABRIKA} secili={null} sec={sec} />);
    expect(screen.getByRole('img', { name: 'Fabrika zemini' })).toBeTruthy();
    expect(container.querySelectorAll('.tc-plan-bolum')).toHaveLength(2);
    fireEvent.pointerDown(container.querySelector('.tc-plan-raf')!);
    expect(sec).toHaveBeenLastCalledWith('raf:5');
    fireEvent.pointerDown(container.querySelector('.tc-plan-alan[data-tur="fason"]')!);
    expect(sec).toHaveBeenLastCalledWith('alan:7');
    fireEvent.pointerDown(container.querySelector('.tc-plan-bolum')!);
    expect(sec).toHaveBeenLastCalledWith('bolum:1');
    fireEvent.pointerDown(screen.getByRole('img', { name: 'Fabrika zemini' }));
    expect(sec).toHaveBeenLastCalledWith(null);
  });

  it('seçili kutu işaretlenir; sec verilmezse salt görünümdür', () => {
    const { container } = render(<FabrikaZemini fabrika={FABRIKA} secili="alan:7" etiket="Konumlar zemini" />);
    expect(container.querySelector('.tc-plan-alan.tc-plan-secili')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Konumlar zemini' })).toBeTruthy();
    fireEvent.pointerDown(container.querySelector('.tc-plan-raf')!);
  });

  it('bölüm yoksa boş durum', () => {
    render(<FabrikaZemini fabrika={{ bolumler: [] }} secili={null} />);
    expect(screen.getByText("Fabrika Haritası'nda bölüm yok.")).toBeTruthy();
  });
});
