import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), Server: { merkezBelgeleri: () => Promise.resolve([]) } },
}));

// Yol değişkenle: istemci tip denetimi Arkon ekran kodunu izlemesin.
const YOL = '../../../../arkon/web/src/app/cizim-merkezi.ts';
const { MerkezSecici } = (await import(/* @vite-ignore */ YOL)) as {
  MerkezSecici(ozellik: { onPick(b: unknown): unknown; onClose(): void }): JSX.Element;
};

describe('Çizim Merkezi penceresi', () => {
  afterEach(cleanup);

  it('Esc Kapat düğmesiyle aynı şekilde kapatır', () => {
    const kapat = vi.fn();
    render(<MerkezSecici onPick={vi.fn()} onClose={kapat} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(kapat).toHaveBeenCalledTimes(1);
  });

  it('başka tuş kapatmaz; pencere kalkınca Esc dinleyicisi kalmaz', () => {
    const kapat = vi.fn();
    const { unmount } = render(<MerkezSecici onPick={vi.fn()} onClose={kapat} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(kapat).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(kapat).not.toHaveBeenCalled();
  });
});
