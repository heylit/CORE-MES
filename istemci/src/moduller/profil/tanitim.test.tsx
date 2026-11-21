import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { TanitimKonusu } from '../../ortak/rota/tanitim.ts';
import { rotalar } from './rotalar.tsx';
import { TANITIM_YOLU, Tanitim } from './Tanitim.tsx';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); });

const KONULAR: readonly TanitimKonusu[] = [
  { anahtar: 'bir', sira: 1, baslik: 'Birinci', alt: 'Deneme', simge: 'play', icerik: () => <p>birinci içerik</p> },
  { anahtar: 'iki', sira: 2, baslik: 'İkinci', alt: 'Deneme', simge: 'gantt', icerik: () => <p>ikinci içerik</p> },
];

function Adres() {
  const k = useLocation();
  return <output data-testid="adres">{`${k.pathname}${k.search}`}</output>;
}
const ciz = (adres: string, konular: readonly TanitimKonusu[] = KONULAR) => render(
  <MemoryRouter initialEntries={[adres]}><Routes><Route path="/profil/tanitim" element={<><Tanitim konular={konular} /><Adres /></>} /></Routes></MemoryRouter>,
);

describe('Tanıtım sayfası (3536)', () => {
  it('Profilim altındadır: Profilim yetkisiyle her role açılır, ayrı sayfa yetkisi yoktur; Hesap menüsünde Tanıtım maddesi vardır', () => {
    expect(TANITIM_YOLU.startsWith('/profil/')).toBe(true);
    expect(rotalar.some((r) => r.yol === TANITIM_YOLU && r.ekran === Tanitim)).toBe(true);
    expect(SAYFALAR.some((s) => (s.yol as string) === '/tanitim')).toBe(false);
    expect(ustEylemler.find((e) => e.anahtar === 'tanitim')).toMatchObject({ islem: 'oturum', yer: 'hesap', hesapMaddesi: { baslik: 'Tanıtım' } });
  });

  it('adresteki konu açılır; bilinmeyen konu ilk konuya düşer; seçim adrese yazılır', () => {
    ciz('/profil/tanitim?konu=iki');
    expect(screen.getByRole('heading', { level: 1, name: 'Tanıtım' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'İkinci tanıtımı' }).textContent).toBe('ikinci içerik');
    cleanup();
    ciz('/profil/tanitim?konu=yok');
    const liste = screen.getByRole('navigation', { name: 'Tanıtım konuları' });
    expect(within(liste).getByRole('button', { name: /Birinci/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(liste).getByRole('button', { name: /İkinci/ }));
    expect(screen.getByTestId('adres').textContent).toBe('/profil/tanitim?konu=iki');
    expect(screen.getByRole('article', { name: 'İkinci tanıtımı' })).toBeTruthy();
    expect(within(liste).getByRole('button', { name: /Birinci/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('konu yoksa boş durum yazar', () => {
    ciz('/profil/tanitim', []);
    expect(screen.getByText('Henüz tanıtım konusu yok.')).toBeTruthy();
  });
});
