import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { aletSecimAnahtari } from '../../../../ortak/cizim/cekirdek/olcum-aleti.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { isSekmeleri, mobilGorunumler, olcuSatirlari } from './kurallar.ts';
import { OlcuListesi, type OlcuListesiOzellikleri } from './OlcuListesi.tsx';
import type { Is, KontrolTakvimi, PlanItem } from './tipler.ts';

// Telefondaki çizimsiz ölçü listesi (1354 a, kart #1358). Değerler uydurmadır.

const BOS: KontrolTakvimi = { due: [], next: null, who: {}, why: {} };
const PLAN: PlanItem[] = [
  { id: 1, nom: 'Ø40', tol: '±0.05', min: 39.95, max: 40.05, tool: 'Kumpas' },
  { id: 2, nom: '18', tol: '±0.1', min: 17.9, max: 18.1, tool: 'Kumpas' },
  { id: 3, nom: 'M8', min: 0, max: 0, tool: 'Tampon', gauge: true },
];
const is = (ek: Partial<Is> = {}): Is => ({ no: 'IE-1', part: 'Deneme', op: 'Op 10', due: '—', target: 10, cycle: 30, state: 'running', good: 0, scrap: 0, meas: {}, pins: [], ...ek } as Is);
const paketli = (files: unknown[]) => is({ pkg: { plan: PLAN, files, steps: [] } as unknown as Is['pkg'] });
const ALET = { id: 'g1', no: 'K-01', type: 'Kumpas', last: Date.now(), interval: 365 };

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('telefonda Resim sekmesi', () => {
  it('dosyasız ama planlı işte panelli istasyonda da açılır ve adı Ölçüler olur', () => {
    const o = paketli([]);
    expect(isSekmeleri(o, true, 'Panel', 'gauge', BOS).some((s) => s.id === 'draw')).toBe(false);
    const t = isSekmeleri(o, true, 'Panel', 'gauge', BOS, true).find((s) => s.id === 'draw');
    expect(t?.l).toBe('Ölçüler');
    expect(mobilGorunumler(o, false, true, 'P', 'gauge', BOS, 0, true).find((s) => s.id === 'draw')?.l).toBe('Ölçüler');
  });

  it('planı boş işte telefonda sekme yoktur; telefon dışında eski kural sürer', () => {
    const o = is({ pkg: { plan: [], files: [{}], steps: [] } as unknown as Is['pkg'] });
    expect(isSekmeleri(o, true, 'Panel', 'gauge', BOS, true).some((s) => s.id === 'draw')).toBe(false);
    expect(isSekmeleri(o, true, 'Panel', 'gauge', BOS).find((s) => s.id === 'draw')?.l).toBe('Resim');
  });

  it('operatörün ölçtüğü ve sırası gelen önce gelir', () => {
    expect(olcuSatirlari(PLAN, [2, 3], [3], {}).map((x) => x.b.id)).toEqual([3, 2, 1]);
  });
});

const ozellik = (ek: Partial<OlcuListesiOzellikleri> = {}): OlcuListesiOzellikleri => ({
  plan: PLAN, operatorOlcer: [1, 2, 3], siradaki: [], olcumler: {}, aletler: [ALET], odak: null, saltOkunur: false, yaz: vi.fn(), bildir: vi.fn(), ...ek,
});

describe('OlcuListesi', () => {
  it('çizim açmaz; ölçü aleti seçilmeden kaydetmez', () => {
    const p = ozellik();
    render(<OlcuListesi {...p} />);
    expect(screen.getByText(/teknik resim açılmaz/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ø40/ }));
    fireEvent.change(screen.getByLabelText('Ölçülen değer'), { target: { value: '40.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(p.yaz).not.toHaveBeenCalled();
    expect(screen.getByText(/Ölçü aleti seçilmeden/)).toBeTruthy();
  });

  it('tolerans içi değeri aletle kaydeder; virgül kaymasında önce sorar', () => {
    yerel.yaz(aletSecimAnahtari('Kumpas'), 'g1');
    const p = ozellik();
    render(<OlcuListesi {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Ø40/ }));
    fireEvent.change(screen.getByLabelText('Ölçülen değer'), { target: { value: '4001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(p.yaz).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /40.01 kaydet/ }));
    expect(p.yaz).toHaveBeenCalledWith(expect.objectContaining({ 1: expect.objectContaining({ v: 40.01, ok: true, gid: 'g1', gno: 'K-01' }) }));
    expect(p.bildir).toHaveBeenCalledWith('Uygun · Ø40 = 40.01', true);
  });

  it('kalitenin ölçtüğü nokta girilemez; salt okunurda giriş yoktur', () => {
    const { rerender } = render(<OlcuListesi {...ozellik({ operatorOlcer: [] })} />);
    fireEvent.click(screen.getByRole('button', { name: /Ø40/ }));
    expect(screen.getByText(/kalite istasyonunda/)).toBeTruthy();
    rerender(<OlcuListesi {...ozellik({ saltOkunur: true })} />);
    expect(screen.queryByLabelText('Ölçülen değer')).toBeNull();
  });
});
