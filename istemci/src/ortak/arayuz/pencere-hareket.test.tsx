import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Pencere } from './index.ts';
import { ETKI_OZNITELIGI } from '../veri/etki.ts';

const kok = document.documentElement;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); kok.removeAttribute(ETKI_OZNITELIGI); });

function ortam(telefon: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('max-width') ? telefon : false, media: q,
    addEventListener: () => undefined, removeEventListener: () => undefined,
  }));
}

function isaret(el: Element, tur: 'pointerDown' | 'pointerMove' | 'pointerUp', y: number) {
  const o = createEvent[tur](el);
  Object.defineProperties(o, { clientY: { value: y }, pointerId: { value: 1 }, button: { value: 0 } });
  fireEvent(el, o);
}

function Deneme({ kapat }: { kapat?: () => void }) {
  const [kayit, kayitYaz] = useState<string | null>('IE-0117');
  return (
    <>
      <button type="button" onClick={() => { kayitYaz('IE-0117'); }}>Aç</button>
      <Pencere acik={kayit !== null} kapat={() => { kapat?.(); kayitYaz(null); }} baslik="Ayrıntı">
        {kayit && <p>{kayit}</p>}
      </Pencere>
    </>
  );
}

describe('pencere kayması ve aşağı çekme (kart 2090, kararlar 2081-11 ve 12)', () => {
  it('kapanırken pencere son içeriğiyle kalır, çıkış bitince kalkar', () => {
    ortam(false);
    render(<Deneme />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    const pencere = screen.getByRole('dialog', { name: 'Ayrıntı' });
    expect(pencere.parentElement?.hasAttribute('data-kapaniyor')).toBe(true);
    expect(screen.getByText('IE-0117')).toBeTruthy();
    fireEvent.animationEnd(pencere);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('çıkış animasyonu gelmezse pencere yine kalkar; kapanırken yeniden açılırsa açık kalır', () => {
    vi.useFakeTimers();
    ortam(false);
    render(<Deneme />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aç', hidden: true }));
    act(() => { vi.advanceTimersByTime(700); });
    expect(screen.getByRole('dialog', { name: 'Ayrıntı' }).parentElement?.hasAttribute('data-kapaniyor')).toBe(false);
  });

  it('etki kapatıldıysa ya da hareket kapalıysa anında kapanır', () => {
    ortam(false);
    kok.setAttribute(ETKI_OZNITELIGI, 'pencere-kayma');
    render(<Deneme />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('telefonda tutamaktan eşiği geçecek kadar aşağı çekilince kapanır; kısa çekiş yerine döner', () => {
    ortam(true);
    const kapat = vi.fn();
    render(<Deneme kapat={kapat} />);
    const pencere = screen.getByRole('dialog', { name: 'Ayrıntı' });
    const tutamak = pencere.querySelector('.tc-pencere-tutamak');
    if (!tutamak) throw new Error('tutamak yok');
    isaret(tutamak, 'pointerDown', 100);
    isaret(tutamak, 'pointerMove', 110);
    expect(pencere.style.getPropertyValue('--pencere-cek')).toBe('10px');
    expect(pencere.hasAttribute('data-cekiliyor')).toBe(true);
    isaret(tutamak, 'pointerUp', 110);
    expect(kapat).not.toHaveBeenCalled();
    expect(pencere.style.getPropertyValue('--pencere-cek')).toBe('0px');
    isaret(tutamak, 'pointerDown', 100);
    isaret(tutamak, 'pointerMove', 260);
    isaret(tutamak, 'pointerUp', 260);
    expect(kapat).toHaveBeenCalledTimes(1);
  });

  it('düğmeden başlayan çekiş, masaüstü ve kapatılmış etki pencereyi çekmez', () => {
    const kapat = vi.fn();
    ortam(true);
    render(<Deneme kapat={kapat} />);
    const dugme = screen.getByRole('button', { name: 'Kapat' });
    isaret(dugme, 'pointerDown', 100);
    isaret(dugme, 'pointerMove', 300);
    isaret(dugme, 'pointerUp', 300);
    expect(kapat).not.toHaveBeenCalled();
    cleanup();

    ortam(false);
    render(<Deneme kapat={kapat} />);
    const baslik = screen.getByRole('heading', { name: 'Ayrıntı' });
    isaret(baslik, 'pointerDown', 100);
    isaret(baslik, 'pointerMove', 300);
    isaret(baslik, 'pointerUp', 300);
    expect(kapat).not.toHaveBeenCalled();
    cleanup();

    ortam(true);
    kok.setAttribute(ETKI_OZNITELIGI, 'pencere-cekme');
    render(<Deneme kapat={kapat} />);
    const baslik2 = screen.getByRole('heading', { name: 'Ayrıntı' });
    isaret(baslik2, 'pointerDown', 100);
    isaret(baslik2, 'pointerMove', 300);
    isaret(baslik2, 'pointerUp', 300);
    expect(kapat).not.toHaveBeenCalled();
  });
});
