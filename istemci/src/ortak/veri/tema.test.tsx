import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { secimiDinle, TEMA_ANAHTARI, tercihSec, tercihUygula, temayiSifirla, useTema, useTemaTercihi } from './tema.ts';

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

  it('yüksek kontrast taban temanın üstüne gelir; kabuk düğmesi kontrastı koruyarak açık ile koyu arasında geçer', () => {
    function Tercih() { return <p>{`tercih:${useTemaTercihi().tercih}`}</p>; }
    render(<><Dugme /><Tercih /></>);
    act(() => { tercihSec('kontrast'); });
    const kok = document.documentElement;
    expect(kok.getAttribute('data-theme')).toBe('dark');
    expect(kok.hasAttribute('data-kontrast')).toBe(true);
    expect(screen.getByText('kabuk:dark')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('tercih:gun')).toBeTruthy();
    expect(kok.getAttribute('data-theme')).toBe('light');
    expect(kok.hasAttribute('data-kontrast')).toBe(true);
    expect(localStorage.getItem(TEMA_ANAHTARI)).toBe('gun');
    act(() => { tercihSec('dark'); });
    expect(kok.hasAttribute('data-kontrast')).toBe(false);
  });

  it('yalnız kişinin seçimi bildirilir; sunucudan gelen tercihin uygulanması geri yazılmaz', () => {
    const secilen: string[] = [];
    secimiDinle((t) => secilen.push(t));
    render(<Dugme />);
    act(() => { tercihUygula('gun'); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(secilen).toEqual([]);
    fireEvent.click(screen.getByRole('button'));
    expect(secilen).toEqual(['kontrast']);
  });

  it('bilinmeyen saklı değer açık temaya düşer', () => {
    localStorage.setItem(TEMA_ANAHTARI, 'mor');
    render(<Okuyan />);
    expect(screen.getByText('modul:light')).toBeTruthy();
  });
});
