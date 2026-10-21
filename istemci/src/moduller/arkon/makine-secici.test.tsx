import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), init: () => new Promise(() => {}), on: () => () => {}, Server: {}, DB: { get: async () => null, all: async () => [] }, Auth: { current: () => null } },
}));

// Yol değişkenle: istemci tip denetimi Arkon ekran kodunu izlemesin.
const YOL = '../../../../arkon/web/src/app/operator-parcalar.ts';
const { MakineSecici } = (await import(/* @vite-ignore */ YOL)) as {
  MakineSecici(ozellik: { makineler: { id: string }[]; secili: string[]; atanan: string | null; ayrim?: unknown; durum: string; onChange(s: string[]): void }): JSX.Element;
};

const M = [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }];
const AYRIM = { planMakinesi: 'M1', ayrimlar: [{ mc: 'M2', emirNo: 'E-7', opNo: 20, baslangic: '2026-10-21T10:30:00+03:00' }] };

// 393 d: seçici planın makinesini etiketler, başka emre ayrılmış makineyi kilitler; kilitli makine seçilemez.
describe('terminal makine seçicisi (393 d)', () => {
  afterEach(cleanup);

  it('planın makinesi "plan" etiketlidir; ayrılmış makine kilitli, emir no ile görünür ve dokunuş seçmez', () => {
    const degis = vi.fn();
    render(<MakineSecici makineler={M} secili={[]} atanan="M1" ayrim={AYRIM} durum="queued" onChange={degis} />);
    expect(screen.getByRole('button', { name: /M1/ }).textContent).toContain('plan');
    const kilitli = screen.getByRole('button', { name: /M2/ }) as HTMLButtonElement;
    expect(kilitli.disabled).toBe(true);
    expect(kilitli.textContent).toContain('E-7');
    expect(kilitli.getAttribute('title')).toContain('E-7 op 20');
    fireEvent.click(kilitli);
    expect(degis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /M3/ }));
    expect(degis).toHaveBeenCalledWith(['M3']);
  });

  it('ayrım okunamazsa hiçbir makine kilitli değildir (bugünkü seçici)', () => {
    const degis = vi.fn();
    render(<MakineSecici makineler={M} secili={[]} atanan="M1" ayrim={null} durum="queued" onChange={degis} />);
    fireEvent.click(screen.getByRole('button', { name: /M2/ }));
    expect(degis).toHaveBeenCalledWith(['M2']);
  });
});
