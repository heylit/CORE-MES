import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { rotalar } from './rotalar.tsx';

afterEach(cleanup);

describe('3688: kalkan "Hazırlık durumu" sayfasının adresi', () => {
  it('eski adres Adım Durumu\'na yönlenir (yer imi kırılmaz)', () => {
    const r = rotalar.find((x) => x.yol === '/arkon/hazirlik-matrisi');
    expect(r).toBeTruthy();
    const Ekran = r!.ekran;
    render(
      <MemoryRouter initialEntries={['/arkon/hazirlik-matrisi?ara=ORN-1']}>
        <Routes>
          <Route path="/arkon/hazirlik-matrisi" element={<Ekran />} />
          <Route path="/adim-durumu" element={<p>Adım Durumu sayfası</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Adım Durumu sayfası')).toBeTruthy();
  });
});
