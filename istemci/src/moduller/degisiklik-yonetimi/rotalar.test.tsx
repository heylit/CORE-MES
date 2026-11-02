import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { etkinMadde, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { emirYolu, talepYolu } from './gosterim.tsx';
import { rotalar } from './rotalar.tsx';

function Adres() {
  return <p data-testid="adres">{useLocation().pathname}</p>;
}

afterEach(() => { cleanup(); });

describe('Değişiklik yönetimi adresleri', () => {
  it('talep ve ECO ayrıntısında ikinci menüde Değişiklikler seçilir', () => {
    const menu = IKINCI_MENULER.find((m) => m.kok === '/degisiklik-yonetimi');
    expect(menu).toBeTruthy();
    const maddeler = menuMaddeleri(menu!);
    expect(etkinMadde(maddeler, talepYolu(7))?.anahtar).toBe('degisiklikler');
    expect(etkinMadde(maddeler, emirYolu(9))?.anahtar).toBe('degisiklikler');
  });

  it.each([['/degisiklik-yonetimi/talepler/7', talepYolu(7)], ['/degisiklik-yonetimi/emirler/9', emirYolu(9)]])('eski adres %s yeni yere gider', (eski, yeni) => {
    const yonlendiren = rotalar.find((r) => r.yol === eski.replace(/\d+$/, ':id'));
    expect(yonlendiren).toBeTruthy();
    const Ekran = yonlendiren!.ekran;
    render(
      <MemoryRouter initialEntries={[eski]}>
        <Routes>
          <Route path={yonlendiren!.yol} element={<Ekran />} />
          <Route path="*" element={<Adres />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('adres').textContent).toBe(yeni);
  });
});
