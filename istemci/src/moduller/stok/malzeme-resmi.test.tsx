import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MalzemeResmi } from './MalKabul.tsx';

// Mal kabul satırında kartın küçük resmi (2872): kare çizim merkezinden okunur; resmi olmayan kartta hiçbir şey çizilmez. Veriler uydurmadır.
const { cagrilar } = vi.hoisted(() => ({ cagrilar: [] as [string, number[]][] }));
vi.mock('../belge-merkezi/disari.ts', () => ({
  DosyaHatasi: class extends Error {},
  dosyaYukle: vi.fn(),
  useKucukResimler: (modul: string, idler: number[]) => {
    cagrilar.push([modul, idler]);
    return new Map(idler.filter((i) => i === 7).map((i) => [i, { hedefId: i, belgeId: 1, revizyonId: 2, harf: 'A', kareSayisi: 1, revUyumu: null }]));
  },
  KucukResimKutusu: ({ resim, ad, boy }: { resim: { revizyonId: number }; ad: string; boy: string }) => (
    <span data-testid="kucuk-resim" data-boy={boy}>{`${ad} ${resim.revizyonId}`}</span>
  ),
}));

afterEach(() => { cleanup(); cagrilar.length = 0; });

describe('mal kabul satırında malzeme resmi (2872)', () => {
  it('resmi olan kartta kare kart no ile malzemeler kaydından okunur ve orta boyda çizilir', () => {
    render(<MalzemeResmi id={7} ad="Deneme mil" />);
    expect(cagrilar).toEqual([['malzemeler', [7]]]);
    const r = screen.getByTestId('kucuk-resim');
    expect(r.textContent).toBe('Deneme mil 2');
    expect(r.dataset['boy']).toBe('orta');
  });

  it('resmi olmayan kartta yer tutucu dahil hiçbir şey çizilmez', () => {
    const { container } = render(<MalzemeResmi id={8} ad="Deneme pul" />);
    expect(cagrilar).toEqual([['malzemeler', [8]]]);
    expect(container.innerHTML).toBe('');
  });
});
