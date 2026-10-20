import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TEMA_ANAHTARI, temayiSifirla, useTema } from './tema.ts';

function Dugme() {
  const { tema, degistir } = useTema();
  return <button type="button" onClick={degistir}>{`kabuk:${tema}`}</button>;
}

// Çerçeveli modül sayfası temayı yalnız okur (çerçeveyi yeni temayla yeniden kurar).
function Okuyan() {
  return <p>{`modul:${useTema().tema}`}</p>;
}

afterEach(() => { cleanup(); temayiSifirla(); localStorage.clear(); });

describe('ortak tema', () => {
  it('kabuktaki değişim temayı okuyan her bileşene yansır; seçim saklanır ve sayfa kökünde durur', () => {
    render(<><Dugme /><Okuyan /></>);
    expect(screen.getByText('modul:light')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('kabuk:dark')).toBeTruthy();
    expect(screen.getByText('modul:dark')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(TEMA_ANAHTARI)).toBe('dark');
  });

  it('saklanan tema açılışta okunur; sonradan açılan bileşen güncel temayla başlar', () => {
    localStorage.setItem(TEMA_ANAHTARI, 'dark');
    render(<Dugme />);
    expect(screen.getByText('kabuk:dark')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button')); });
    render(<Okuyan />);
    expect(screen.getByText('modul:light')).toBeTruthy();
  });
});
