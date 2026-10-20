import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { rotalariTopla } from '../../ortak/rota/kesif.ts';

vi.mock('./IkCercevesi.tsx', () => ({ IkCercevesi: () => <p>ik çerçevesi</p>, IkIslemlerimCercevesi: () => <p>ik işlemlerim</p> }));
vi.mock('../nizamiye/disari.ts', () => ({ PdksDosyaAktar: () => <p>pdks aktar</p> }));

const { rotalar } = await import('./rotalar.tsx');

function ac(adres: string): void {
  render(<MemoryRouter initialEntries={[adres]}><Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes></MemoryRouter>);
}

afterEach(cleanup);

describe('İK rotaları', () => {
  it('PDKS aktarımı İK sayfasında ayrı ekrandır (341 a); öteki görünümler çerçevede kalır', () => {
    expect(() => rotalariTopla({ 'ik/rotalar.tsx': { rotalar } })).not.toThrow();
    ac('/ik/pdks');
    expect(screen.getByText('pdks aktar')).toBeTruthy();
    expect(screen.queryByText('ik çerçevesi')).toBeNull();
    cleanup();
    ac('/ik/devam');
    expect(screen.getByText('ik çerçevesi')).toBeTruthy();
  });
});
