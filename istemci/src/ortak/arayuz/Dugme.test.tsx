import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
