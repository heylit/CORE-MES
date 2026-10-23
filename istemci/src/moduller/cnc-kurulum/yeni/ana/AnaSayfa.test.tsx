import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { save, state } from '../depo.ts';
import { defaults } from '../durum.ts';
import { S } from '../parca-durumu.ts';
import type { HamSonuc } from '../hesap/ham.ts';
import { allMachines, dirtyUsage } from '../secici.ts';

vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));
vi.mock('../gorunum.ts', async (asil) => ({ ...await asil<object>(), useGorunum: () => ({ gorunum: 'home', burada: true, git: vi.fn() }) }));
const yetki = vi.hoisted(() => ({ yazabilir: true }));
vi.mock('../veri.ts', () => ({ useCncYetkisi: () => yetki }));

const { AnaSayfa } = await import('./AnaSayfa.tsx');

function ac() { return render(<MemoryRouter><AnaSayfa /></MemoryRouter>); }
function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  dirtyUsage();
  S.res = null;
}
afterEach(cleanup);
beforeEach(() => { sifirla(); yetki.yazabilir = true; vi.mocked(save).mockClear(); });

describe('Ana sayfa tezgâh durumu', () => {
  it('yazabilen kişi durumu seçer; seçim kayda yazılır', () => {
    ac();
    const m = allMachines()[0]!;
    fireEvent.change(screen.getByLabelText(`${m.name}: durum`), { target: { value: 'down' } });
    expect((state.mstat as Record<string, string>)[m.id]).toBe('down');
    expect(save).toHaveBeenCalled();
  });

  it('yazamayan kişide durum seçimi yok, yalnız metin', () => {
    yetki.yazabilir = false;
    ac();
    expect(screen.queryByLabelText(`${allMachines()[0]!.name}: durum`)).toBeNull();
    expect(screen.getAllByText('Boşta').length).toBeGreaterThan(0);
  });
});

describe('Program ve ham malzeme kartı', () => {
  it('Ham Malzeme sayfası satırı yalnız ham hesabı varken görünür', () => {
    ac();
    expect(screen.queryByText('Ham Malzeme sayfası')).toBeNull();
    cleanup();
    S.res = { ok: true, label: 'Ø40 × 60', Vp: 1, ratio: 0.42, ms: 1.234 } as HamSonuc;
    ac();
    expect(screen.getByText('Ham Malzeme sayfası')).toBeTruthy();
    expect(screen.getByText('%42')).toBeTruthy();
    expect(screen.getByText('elle girilen')).toBeTruthy();
  });
});
