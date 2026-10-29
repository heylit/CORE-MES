import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { rotalar } from './rotalar.tsx';

function Konum() {
  const { pathname, search } = useLocation();
  return <p>Konum {pathname}{search}</p>;
}

function ac(adres: string) {
  render(
    <MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map(({ yol, ekran: Ekran }) => <Route key={yol} path={yol} element={<Ekran />} />)}
        <Route path="*" element={<Konum />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

// 979 a: eski Rota ekranları kalktı; her adres Reçete ve Rota'daki karşılığına yönlenir, yer imi boş sayfa açmaz.
describe('eski Rota adresleri', () => {
  it.each([
    ['/rota', '/recete-rota/schema'],
    ['/rota/12', '/recete-rota/schema'],
    ['/rota/operasyonlar', '/recete-rota/schema'],
    ['/rota/sablonlar', '/recete-rota/schema'],
    ['/rota/operator', '/recete-rota/schema'],
    ['/rota/stok', '/recete-rota/stock'],
    ['/rota/malzemeler', '/recete-rota/items'],
    ['/rota/kaynaklar', '/recete-rota/res'],
    ['/rota/plan', '/recete-rota/plan'],
    ['/rota/plan-studyosu', '/recete-rota/studio'],
    ['/rota/kanban', '/recete-rota/kanban'],
    ['/cizelge', '/recete-rota/plan'],
    ['/matris', '/recete-rota/plan'],
    ['/emirler?durum=basladi', '/uretim-emirleri?durum=basladi'],
    ['/rota/emirler', '/uretim-emirleri'],
  ])('%s -> %s', async (adres, hedef) => {
    ac(adres);
    expect(await screen.findByText(`Konum ${hedef}`)).toBeTruthy();
  });

  it('ikinci menünün her maddesi bir yönlendirmeye düşer', async () => {
    const menu = IKINCI_MENULER.find((m) => m.kok === '/rota');
    if (menu === undefined) throw new Error('Rota ikinci menüsü yok');
    const maddeler: readonly { yol: string }[] = menu.gruplar.flatMap((g): readonly { yol: string }[] => g.maddeler);
    for (const madde of maddeler) {
      ac(madde.yol);
      expect((await screen.findByText(/^Konum \/recete-rota\//)).textContent, madde.yol).toMatch(/^Konum \/recete-rota\//);
      cleanup();
    }
  });
});
