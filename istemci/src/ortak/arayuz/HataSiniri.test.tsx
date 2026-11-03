import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GUNCELLEME_ILETISI, HataSiniri, parcaYuklenemedi } from './HataSiniri.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Firlat({ hata }: { hata: Error }): never {
  throw hata;
}

function kur(hata: Error) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const yenile = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload: yenile });
  render(<HataSiniri><Firlat hata={hata} /></HataSiniri>);
  return yenile;
}

describe('HataSiniri', () => {
  it('tarayicilarin parca yukleme hatalarini tanir, ekranin kendi hatasini tanimaz', () => {
    expect(parcaYuklenemedi(new TypeError('Failed to fetch dynamically imported module: /assets/a-1234abcd.js'))).toBe(true);
    expect(parcaYuklenemedi(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(parcaYuklenemedi(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(parcaYuklenemedi(new Error('Unable to preload CSS for /assets/b-1234abcd.css'))).toBe(true);
    expect(parcaYuklenemedi(new Error('x tanımsız'))).toBe(false);
    expect(parcaYuklenemedi('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('guncelleme sonrasi parca yuklenemeyince sayfa kendiliginden yenilenmez; kullanici dugmeyle yeniler', () => {
    const yenile = kur(new TypeError('Failed to fetch dynamically imported module: /assets/a-1234abcd.js'));
    try {
      expect(screen.getByRole('alert').textContent).toContain(GUNCELLEME_ILETISI);
      expect(yenile).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Sayfayı yenile' }));
      expect(yenile).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ekranin kendi hatasinda eski kutu kalir ve sayfa yenilenmez', () => {
    const yenile = kur(new Error('x tanımsız'));
    try {
      expect(screen.getByRole('alert').textContent).toContain('Bu ekran açılırken bir hata oluştu');
      expect(screen.queryByText(GUNCELLEME_ILETISI)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
      expect(yenile).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
