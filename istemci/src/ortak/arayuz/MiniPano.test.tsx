import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MiniPanoKutucugu } from './MiniPano.tsx';

function Adres() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}

const ciz = (sayi: number | null | undefined, ton?: 'dikkat' | 'uyari') => render(
  <MemoryRouter>
    <MiniPanoKutucugu baslik="Geciken teslim" simge="clock" sayi={sayi} altMetin="termini geçmiş" ton={ton} yol="/satin-alma/talepler?durum=late" />
    <Adres />
  </MemoryRouter>,
);

describe('MiniPanoKutucugu', () => {
  it('veri yoksa sifir uydurmaz, tire ve "veri yok" yazar; tonsuz kalir', () => {
    ciz(null, 'dikkat');
    const k = screen.getByRole('button', { name: /Geciken teslim/ });
    expect(k.textContent).toContain('—');
    expect(k.textContent).toContain('veri yok');
    expect(k.dataset.ton).toBeUndefined();
  });

  it('ton yalniz sayi sifirdan buyukken gorunur', () => {
    const { unmount } = ciz(0, 'dikkat');
    expect(screen.getByRole('button', { name: /Geciken teslim/ }).dataset.ton).toBeUndefined();
    unmount();
    ciz(4, 'dikkat');
    expect(screen.getByRole('button', { name: /Geciken teslim/ }).dataset.ton).toBe('dikkat');
  });

  it('tiklaninca ana pencerede listeyi acar ve ana pencereyi one getirir', () => {
    const one = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    ciz(4);
    fireEvent.click(screen.getByRole('button', { name: /Geciken teslim/ }));
    expect(screen.getByRole('status').textContent).toBe('/satin-alma/talepler?durum=late');
    expect(one).toHaveBeenCalled();
    one.mockRestore();
  });
});
