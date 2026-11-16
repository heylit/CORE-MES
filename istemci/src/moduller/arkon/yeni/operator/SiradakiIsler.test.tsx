import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bosIs } from './kurallar.ts';
import { SiradakiIsler } from './SiradakiIsler.tsx';
import type { Is } from './tipler.ts';

afterEach(cleanup);

// 3338-6 a: istasyonun işleri şeridi. Veriler uydurmadır (ORN-).
const is = (no: string, state: Is['state']): Is => ({ ...bosIs({ l: 'Deneme' }), empty: false, no, part: `ORN parça ${no}`, op: 'Op 20', state, target: 10, good: 2 });
const ISLER = [is('ORN-1', 'done'), is('ORN-2', 'running'), is('ORN-3', 'queued'), is('ORN-4', 'queued')];
const ciz = (bakilan: number, secilen: number[] = []) => render(
  <SiradakiIsler isler={ISLER} ekranda={1} bakilan={bakilan} siradakiMi={(i) => i === 2} yer={() => null} sec={(i) => secilen.push(i)} eylem={bakilan >= 0 ? <span>Önizleme</span> : null} />,
);

describe('Sıradaki işler şeridi (3338-6 a)', () => {
  it('sayaç biten işi saymaz; ekrandaki kart basılı; biten kart soluk, sıradaki işaretli', () => {
    ciz(-1);
    expect(screen.getByText(/iş · 2\/4$/).textContent).toBe('3 iş · 2/4');
    expect(screen.getByRole('button', { name: 'ORN-2 · ekranda' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'ORN-3' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'ORN-1' }).closest('li')!.hasAttribute('data-bitti')).toBe(true);
    expect(screen.getByRole('button', { name: 'ORN-3' }).closest('li')!.hasAttribute('data-bitti')).toBe(false);
    expect(screen.getByRole('button', { name: 'ORN-3' }).textContent).toContain('Sıradaki');
    expect(screen.getByRole('button', { name: 'ORN-4' }).textContent).not.toContain('Sıradaki');
  });

  it('bakılan kart basılı olur, ekrandaki olmaz; dokunuş yalnız seçimi bildirir; eylem şeridin altında', () => {
    const secilen: number[] = [];
    ciz(3, secilen);
    expect(screen.getByRole('button', { name: 'ORN-4' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'ORN-2 · ekranda' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Önizleme')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN-3' }));
    expect(secilen).toEqual([2]);
  });
});
