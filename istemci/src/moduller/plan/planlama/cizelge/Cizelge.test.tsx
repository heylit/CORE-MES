import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Cizelge } from './Cizelge.tsx';
import { olcekKur } from './olcek.ts';

afterEach(() => { cleanup(); });

const SATIRLAR = [
  { anahtar: 'M1', baslik: 'Tezgah 1', cubuklar: [{ anahtar: 'S1.10', bas: 2, bit: 10, etiket: 'S1 OP 10' }, { anahtar: 'S2.10', bas: 60, bit: 70, etiket: 'dışarıda' }] },
  { anahtar: 'M2', baslik: 'Tezgah 2', cubuklar: [] },
];

describe('Cizelge', () => {
  it('kaynak başına satır; pencere dışındaki çubuk çizilmez; çubuk konumu ölçekten', () => {
    const { container } = render(<Cizelge etiket="Plan" olcek={olcekKur(0, 48, 10)} satirlar={SATIRLAR} />);
    expect([...container.querySelectorAll('[data-satir]')].map((s) => s.getAttribute('data-satir'))).toEqual(['M1', 'M2']);
    const cubuklar = container.querySelectorAll('[data-cubuk]');
    expect(cubuklar).toHaveLength(1);
    const rect = cubuklar[0]?.querySelector('rect');
    expect(rect?.getAttribute('x')).toBe('20');
    expect(rect?.getAttribute('width')).toBe('80');
  });

  it('seçim verilirse çubuk tıklama ve klavyeyle seçilir; verilmezse düğme değildir', () => {
    const sec = vi.fn();
    const { container, rerender } = render(<Cizelge etiket="Plan" olcek={olcekKur(0, 48)} satirlar={SATIRLAR} sec={sec} />);
    const g = container.querySelector('[data-cubuk="S1.10"]');
    if (g === null) throw new Error('çubuk yok');
    fireEvent.click(g);
    fireEvent.keyDown(g, { key: 'Enter' });
    expect(sec).toHaveBeenCalledTimes(2);
    expect(sec).toHaveBeenCalledWith('S1.10');
    rerender(<Cizelge etiket="Plan" olcek={olcekKur(0, 48)} satirlar={SATIRLAR} />);
    expect(container.querySelector('[data-cubuk="S1.10"]')?.getAttribute('role')).toBeNull();
  });
});
