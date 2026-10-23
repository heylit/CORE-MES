import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { OLAY_GRUPLARI } from './akislar.ts';
import { OlaySecici } from './OlaySecici.tsx';

afterEach(cleanup);

describe('OlaySecici', () => {
  it('olaylar dört grupta, prototipteki sırayla çizilir', () => {
    render(<OlaySecici sec={() => {}} />);
    const kok = screen.getByRole('group', { name: 'Ne oldu?' });
    const gruplar = within(kok).getAllByRole('group');
    expect(gruplar.map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent))
      .toEqual(['Satış ve tahsilat', 'Alış ve ödeme', 'Çek ve banka', 'Aktarım ve mahsup']);
    expect(within(kok).getAllByRole('button')).toHaveLength(14);
  });

  it('her olay kendi türüyle seçilir', () => {
    const sec = vi.fn();
    render(<OlaySecici sec={sec} />);
    const olaylar = OLAY_GRUPLARI.flatMap((g) => g.olaylar);
    for (const o of olaylar) fireEvent.click(screen.getByRole('button', { name: new RegExp(o.baslik.replace(/[/()]/g, '.')) }));
    expect(sec.mock.calls.map((c) => c[0])).toEqual(olaylar.map((o) => o.tur));
  });
});
