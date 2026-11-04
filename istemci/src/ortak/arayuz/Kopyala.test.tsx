import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Kopyala } from './Kopyala.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-etki-kapali');
});

describe('Kopyala (kart 2090, karar 2081-18)', () => {
  it('güvenli bağlamda panoya yazar ve Kopyalandı der', async () => {
    const yaz = vi.fn(() => Promise.resolve());
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: yaz } });
    render(<Kopyala metin="IE-2026-0117" etiket="Belge numarasını kopyala" />);
    fireEvent.click(screen.getByRole('button', { name: 'Belge numarasını kopyala' }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('Kopyalandı'); });
    expect(yaz).toHaveBeenCalledWith('IE-2026-0117');
  });

  it('güvenli olmayan bağlamda eski yolu dener; o da olmazsa Kopyalanamadı der', async () => {
    vi.stubGlobal('isSecureContext', false);
    const komut = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: komut });
    render(<Kopyala metin="IE-1" etiket="Kopyala" />);
    fireEvent.click(screen.getByRole('button', { name: 'Kopyala' }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('Kopyalandı'); });
    expect(komut).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    komut.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Kopyala' }));
    await waitFor(() => { expect(screen.getByRole('status').textContent).toBe('Kopyalanamadı'); });
  });

  it('etki kapatıldıysa düğme çizilmez', () => {
    document.documentElement.setAttribute('data-etki-kapali', 'kopyala');
    render(<Kopyala metin="IE-1" etiket="Kopyala" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
