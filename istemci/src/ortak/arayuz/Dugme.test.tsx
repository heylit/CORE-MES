import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dugme } from './Dugme.tsx';

const kok = document.documentElement;
afterEach(() => {
  cleanup();
  kok.removeAttribute('data-etki-kapali');
  kok.removeAttribute('data-hareket');
});

describe('Dugme dalgasi (karar 2081-9)', () => {
  it('dokunulan yerden dalga cizer, kendi isleyicisini de cagirir; animasyon bitince kalkar', () => {
    const bas = vi.fn();
    render(<Dugme onPointerDown={bas}>Kaydet</Dugme>);
    const d = screen.getByRole('button', { name: 'Kaydet' });
    fireEvent.pointerDown(d, { clientX: 5, clientY: 5 });
    expect(bas).toHaveBeenCalledTimes(1);
    const dalga = d.querySelector('.tc-dugme-dalga') as HTMLElement;
    expect(dalga).not.toBeNull();
    expect(dalga.style.getPropertyValue('--dalga-x')).toMatch(/px$/);
    expect(d.querySelector('.tc-dugme-dalga-kap')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.animationEnd(dalga);
    expect(d.querySelector('.tc-dugme-dalga')).toBeNull();
  });

  it('kurum dalgayi kapattiysa ya da hareket kapaliysa cizilmez', () => {
    kok.setAttribute('data-etki-kapali', 'dalga');
    render(<Dugme>Kaydet</Dugme>);
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(document.querySelector('.tc-dugme-dalga')).toBeNull();
    kok.removeAttribute('data-etki-kapali');
    kok.setAttribute('data-hareket', 'kapali');
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(document.querySelector('.tc-dugme-dalga')).toBeNull();
  });
});

describe('Dugme basılı tutunca yineleme (kart 2090, karar 2081-17)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('tek dokunuş tek adımdır; basılı tutunca hızlanarak yinelenir, bırakınca gelen tıklama ikilemez', () => {
    vi.useFakeTimers();
    const artir = vi.fn();
    render(<Dugme aria-label="Artır" basiliTekrar onClick={artir} />);
    const d = screen.getByRole('button', { name: 'Artır' });
    fireEvent.pointerDown(d); fireEvent.pointerUp(d); fireEvent.click(d, { detail: 1 });
    expect(artir).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(d);
    act(() => { vi.advanceTimersByTime(399); });
    expect(artir).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(artir).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(320 + 256 + 205); });
    expect(artir).toHaveBeenCalledTimes(5);
    fireEvent.pointerUp(d); fireEvent.click(d, { detail: 1 });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(artir).toHaveBeenCalledTimes(5);
    fireEvent.click(d, { detail: 0 });
    expect(artir).toHaveBeenCalledTimes(6);
  });

  it('düğme pasifleşince durur; özellik verilmediyse ya da etki kapatıldıysa yinelemez', () => {
    vi.useFakeTimers();
    const artir = vi.fn();
    const { rerender } = render(<Dugme aria-label="Artır" basiliTekrar onClick={artir} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Artır' }));
    act(() => { vi.advanceTimersByTime(400); });
    rerender(<Dugme aria-label="Artır" basiliTekrar onClick={artir} disabled />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(artir).toHaveBeenCalledTimes(1);
    cleanup();

    const sade = vi.fn();
    render(<Dugme aria-label="Sade" onClick={sade} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sade' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(sade).not.toHaveBeenCalled();
    cleanup();

    kok.setAttribute('data-etki-kapali', 'hizli-artis');
    render(<Dugme aria-label="Artır" basiliTekrar onClick={sade} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Artır' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(sade).not.toHaveBeenCalled();
  });
});
