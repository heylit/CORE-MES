import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as gonder from '../motor/atolye/gonder.ts';
import { Hamleler } from './Hamleler.tsx';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma örnek: iki adımlı geç emir. İlk adımı öne almak bitişi değiştirmez, ikinci adımı öteki tezgâha almak emri erken bitirir.
const is = (id: string, m: string, S: number, C: number, sira = 0): KokpitIsi => ({ id, job: 'a', ad: sira ? 'Freze' : 'Torna', m, S, C, basladi: false, fason: false, kilitli: false, sira });
const E: KokpitEmri = { id: 'a', no: 'ORN-a', urun: 'Deneme', adet: 1, termin: 30, bitis: 44, durum: 'gec', gecikme: 14, adimlar: [{ id: 'a.1', ad: 'Torna', adaylar: ['T1'] }, { id: 'a.2', ad: 'Freze', adaylar: ['T1', 'T2'] }] };
const M: KokpitModeli = {
  simdi: 1, tezgahlar: [{ id: 'T1', kod: 'T1', ad: '', fason: false }, { id: 'T2', kod: 'T2', ad: '', fason: false }],
  isler: Object.fromEntries([is('a.1', 'T1', 2, 6), is('a.2', 'T1', 40, 44, 1), { ...is('b.1', 'T1', 6, 40), job: 'b' }, { ...is('c.1', 'T2', 0, 10), job: 'c' }].map((x) => [x.id, x])),
  emirler: [E], bas: 0, son: 336, acik: {},
};
function onizlemeKur() {
  vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => {
    const x = M.isler[g.isId];
    if (!x) return Promise.resolve(null);
    return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + x.C - x.S, eskiTezgah: x.m, eskiS: x.S, tur: 'tasinan' as const }] });
  });
}
const zaman = (t: number): string => `00.00 ${String(t)}`;

describe('Hamleler', () => {
  it('emrin bütünü için yalnız emri erken bitiren hamleyi önerir', async () => {
    onizlemeKur();
    const { container } = render(<Hamleler m={M} e={E} isId={null} zaman={zaman} uygula={vi.fn()} tek surum={4} />);
    expect(await screen.findByText(/1 gün 6 sa erken/)).toBeTruthy();
    expect(container.querySelectorAll('[data-hamle]')).toHaveLength(1);
    expect(container.querySelector('[data-hamle="T2"]')).not.toBeNull();
    expect(container.querySelector('[data-baska]')).toBeNull();
  });

  it('Kalanını oynat: önizlemeler bitince öne çıkan hamle bir kez bildirilir', async () => {
    onizlemeKur();
    const oynat = vi.fn();
    render(<Hamleler m={M} e={E} isId={null} zaman={zaman} uygula={vi.fn()} tek surum={4} oynat={oynat} />);
    await screen.findByText(/erken/);
    await waitFor(() => { expect(oynat).toHaveBeenCalledTimes(1); });
    expect(oynat).toHaveBeenCalledWith({ isId: 'a.2', tezgah: 'T2', baslangic: 10 });
  });

  it('seçili adımın yer seçenekleri kazanç aranmadan gösterilir', async () => {
    onizlemeKur();
    const { container } = render(<Hamleler m={M} e={E} isId="a.1" zaman={zaman} uygula={vi.fn()} surum={4} />);
    expect(await screen.findByText(/biter/)).toBeTruthy();
    expect(container.querySelector('[data-hamle="T1"]')).not.toBeNull();
  });
  it('plan yeniden dizilirken önizleme istemez; bitince ister', async () => {
    onizlemeKur();
    const o = { m: M, e: E, isId: null, zaman, uygula: null, tek: true, surum: 4 };
    const { rerender } = render(<Hamleler {...o} bekle />);
    await Promise.resolve();
    expect(gonder.isTasiOnizle).not.toHaveBeenCalled();
    rerender(<Hamleler {...o} />);
    expect(await screen.findByText(/erken/)).toBeTruthy();
    expect(gonder.isTasiOnizle).toHaveBeenCalled();
  });
});
