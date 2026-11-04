import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import type { MutableRefObject } from 'react';
import { acilirYonu, useAcilirKonum } from './acilir-konum.ts';

afterEach(() => { cleanup(); });

const kutu = (top: number, bottom: number, left = 100) =>
  ({ top, bottom, left, right: left + 200, width: 200, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function Deneme({ ust, alt }: { ust: number; alt: number }) {
  const { capa, katman } = useAcilirKonum<HTMLButtonElement, HTMLDivElement>(true);
  return (
    <>
      <button type="button" ref={(el) => { if (el) { el.getBoundingClientRect = () => kutu(ust, alt); } (capa as MutableRefObject<HTMLButtonElement | null>).current = el; }}>Aç</button>
      {createPortal(<div
          ref={(el) => { if (el) Object.defineProperty(el, 'offsetHeight', { value: 300 }); (katman as MutableRefObject<HTMLDivElement | null>).current = el; }}
          className="tc-acilir-katman" data-testid="katman"
        />, document.body)}
    </>
  );
}

describe('useAcilirKonum (kart 2094)', () => {
  it('altta yer yetiyorsa ya da alt üstten genişse aşağı, değilse yukarı açar', () => {
    expect(acilirYonu(400, 100, 300)).toBe('asagi');
    expect(acilirYonu(200, 100, 300)).toBe('asagi');
    expect(acilirYonu(100, 500, 300)).toBe('yukari');
  });

  it('sayfanın altındaki çapada liste body içinde yukarı açılır ve çapanın üst kenarına göre konumlanır', () => {
    const boy = window.innerHeight;
    const { getByTestId } = render(<Deneme ust={boy - 40} alt={boy - 10} />);
    const k = getByTestId('katman');
    expect(k.parentElement).toBe(document.body);
    expect(k.dataset.yon).toBe('yukari');
    expect(k.style.getPropertyValue('--tc-acilir-alt')).toBe('40px');
  });

  it('sayfanın üstündeki çapada liste aşağı açılır ve çapanın alt kenarından başlar', () => {
    const { getByTestId } = render(<Deneme ust={10} alt={40} />);
    const k = getByTestId('katman');
    expect(k.dataset.yon).toBe('asagi');
    expect(k.style.getPropertyValue('--tc-acilir-ust')).toBe('40px');
  });
});
