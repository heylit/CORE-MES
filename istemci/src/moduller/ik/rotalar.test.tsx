import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { rotalariTopla } from '../../ortak/rota/kesif.ts';

vi.mock('./yeni/IkYeni.tsx', () => ({ IkYeniIk: () => <p>ik ekranı</p>, IkYeniIslemlerim: () => <p>ik işlemlerim</p> }));
vi.mock('../nizamiye/disari.ts', () => ({ PdksDosyaAktar: () => <p>pdks aktar</p> }));

const { rotalar, denemeAdresininYenisi } = await import('./rotalar.tsx');

function Konum() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}
function ac(adres: string): void {
  render(
    <MemoryRouter initialEntries={[adres]}>
      <Konum />
      <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('İK rotaları', () => {
  it('PDKS aktarımı İK sayfasında ayrı ekrandır (341 a); öteki görünümler İK ekranındadır', async () => {
    expect(() => rotalariTopla({ 'ik/rotalar.tsx': { rotalar } })).not.toThrow();
    ac('/ik/pdks');
    expect(screen.getByText('pdks aktar')).toBeTruthy();
    cleanup();
    ac('/ik/devam');
    expect(await screen.findByText('ik ekranı')).toBeTruthy();
    cleanup();
    ac('/ik-islemlerim/izinlerim');
    expect(await screen.findByText('ik işlemlerim')).toBeTruthy();
  });

  it('deneme adresleri (eski `/yeni`) aynı görünüme gider, sorgu korunur', async () => {
    expect(denemeAdresininYenisi('/ik/yeni')).toBe('/ik');
    expect(denemeAdresininYenisi('/ik/yeni/calisan/emp_b')).toBe('/ik/calisan/emp_b');
    expect(denemeAdresininYenisi('/ik-islemlerim/yeni/onaylar')).toBe('/ik-islemlerim/onaylar');
    expect(denemeAdresininYenisi('/ik/yenilik')).toBe('/ik/yenilik');
    ac('/ik-islemlerim/yeni/izinlerim?ay=2026-10');
    expect(await screen.findByText('ik işlemlerim')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('/ik-islemlerim/izinlerim?ay=2026-10');
  });
});
