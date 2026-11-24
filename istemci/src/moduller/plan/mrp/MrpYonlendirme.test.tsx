import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MRP_YOLU, MrpYonlendirme } from './MrpYonlendirme.tsx';

afterEach(cleanup);

describe('Malzeme ihtiyacı eski adresi', () => {
  it('Malzeme ihtiyacı ve satın alma sayfasına yönlenir', () => {
    render(
      <MemoryRouter initialEntries={[MRP_YOLU]}>
        <Routes>
          <Route path={MRP_YOLU} element={<MrpYonlendirme />} />
          <Route path="/plan/malzplan" element={<p>malzeme sayfası</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('malzeme sayfası')).toBeTruthy();
  });
});
