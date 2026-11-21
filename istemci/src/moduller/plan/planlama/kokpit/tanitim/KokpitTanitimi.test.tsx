import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SURE_NOTU } from '../../motor/ust/HesapSuresi.tsx';
import { BOLGELER, KokpitTanitimi } from './KokpitTanitimi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); document.documentElement.removeAttribute('data-hareket'); });

describe('Kokpit tanıtımı (3536)', () => {
  it('beş bölüm başlığını taşır, yalnız ORN- örnek veriyle çizer ve istek atmaz', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(<KokpitTanitimi />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '1Ekranı okumak', '2Plan menüsü: üç fiil, üç ayrı iş', '3Taslaktan canlıya', '4Hesap sürerken', '5Günlük kullanım, beş adım',
    ]);
    expect(within(container).getByText('ORN-TZG-01')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bölge maddesine basınca yalnız o madde basılı olur ve şemada o bölge yanar', () => {
    const { container } = render(<KokpitTanitimi />);
    const maddeler = BOLGELER.map((b) => screen.getByRole('button', { name: new RegExp(b.ad) }));
    fireEvent.click(maddeler[3]!);
    expect(maddeler.map((m) => m.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    expect(container.querySelector('.tc-ktn-sema-tahta')?.hasAttribute('data-yanik')).toBe(true);
    expect(container.querySelectorAll('.tc-ktn-sema [data-yanik]')).toHaveLength(1);
  });

  it('hareket açıkken vurgu bir tur ilerleyip ilk bölgede durur; elle seçilince hemen durur', () => {
    vi.useFakeTimers();
    render(<KokpitTanitimi />);
    const madde = (i: number) => screen.getByRole('button', { name: new RegExp(BOLGELER[i]!.ad) });
    expect(madde(0).getAttribute('aria-pressed')).toBe('true');
    act(() => { vi.advanceTimersByTime(3600); });
    expect(madde(1).getAttribute('aria-pressed')).toBe('true');
    act(() => { vi.advanceTimersByTime(3500 * 4); });
    expect(madde(0).getAttribute('aria-pressed')).toBe('true');
    act(() => { vi.advanceTimersByTime(3500 * 3); });
    expect(madde(0).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(madde(4));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(madde(4).getAttribute('aria-pressed')).toBe('true');
  });

  it('hesap örneği eşiğe kadar not göstermez, sonra geçen süreyle ekrandaki notu yazar; bitince Plan güncel olur', () => {
    vi.useFakeTimers();
    render(<KokpitTanitimi />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText(new RegExp(SURE_NOTU))).toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(`5 sn · ${SURE_NOTU}`)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.queryByText(new RegExp(SURE_NOTU))).toBeNull();
    expect(screen.getByText('Plan güncel')).toBeTruthy();
  });

  it('işletim sistemi hareketi azaltınca da sayaç son değerinde başlar ve vurgu ilerlemez', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    render(<KokpitTanitimi />);
    expect(screen.getByText('42')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole('button', { name: new RegExp(BOLGELER[0].ad) }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(`12 sn · ${SURE_NOTU}`)).toBeTruthy();
  });

  it('hareket kapalıysa sayılar son değerinde başlar ve vurgu kendiliğinden ilerlemez', () => {
    vi.useFakeTimers();
    document.documentElement.setAttribute('data-hareket', 'kapali');
    render(<KokpitTanitimi />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('%82')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole('button', { name: new RegExp(BOLGELER[0].ad) }).getAttribute('aria-pressed')).toBe('true');
    // Hesap örneği eşiği geçmiş hâlde durur; not ekrandaki notun aynısıdır.
    expect(screen.getByText(`12 sn · ${SURE_NOTU}`)).toBeTruthy();
  });
});
