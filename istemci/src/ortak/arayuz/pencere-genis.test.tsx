import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pencere } from './index.ts';

// Geniş çekmece (kart 2167): yalnız yan pencerede geçerlidir; orta ve tam pencere genişliğini değiştirmez.
describe('Pencere genis', () => {
  it('yan pencerede geniş sınıfını taşır, verilmezse taşımaz', () => {
    const { unmount } = render(<Pencere acik kapat={() => {}} baslik="Geniş" tur="yan" genis><p>form</p></Pencere>);
    expect(screen.getByRole('dialog', { name: 'Geniş' }).classList.contains('tc-pencere-genis')).toBe(true);
    unmount();
    render(<Pencere acik kapat={() => {}} baslik="Dar" tur="yan"><p>form</p></Pencere>);
    expect(screen.getByRole('dialog', { name: 'Dar' }).classList.contains('tc-pencere-genis')).toBe(false);
  });

  it('orta ve tam pencerede yok sayılır', () => {
    const { unmount } = render(<Pencere acik kapat={() => {}} baslik="Orta" genis><p>a</p></Pencere>);
    expect(screen.getByRole('dialog', { name: 'Orta' }).classList.contains('tc-pencere-genis')).toBe(false);
    unmount();
    render(<Pencere acik kapat={() => {}} baslik="Tam" tur="tam" genis><p>b</p></Pencere>);
    expect(screen.getByRole('dialog', { name: 'Tam' }).classList.contains('tc-pencere-genis')).toBe(false);
  });
});
