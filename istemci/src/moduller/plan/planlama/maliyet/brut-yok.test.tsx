import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { GiderSayfasi } from './asil/GiderSayfasi.tsx';
import { MesaiSayfasi } from './asil/MesaiSayfasi.tsx';
import { genelGiderHesabi, takvimKur } from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

afterEach(cleanup);

const kap = (n: ReactNode) => render(<QueryClientProvider client={new QueryClient()}><BildirimSaglayici><MemoryRouter>{n}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
// Eski kayıtta brüt dursa da ekran onu göstermez ve girişini sunmaz (2728 a). Tutar uydurma, gerçek ücret değildir.
const brutlu = () => ornekCalisma({ D: { maliyetSis: { dolayli: [{ id: 'G1', gorev: 'Deneme gorev', brut: 1234567 }] }, mesaiSis: { ucret: { P1: { brut: 1234567, yil: 3 } } } } });

describe('brüt ücret ekranda yok (2728 a)', () => {
  it('Giderler: dolaylı personel görevi bilgi olarak kalır, brüt girişi ve tutarı yok', () => {
    const c = brutlu();
    const { container } = kap(<GiderSayfasi c={c} G={genelGiderHesabi(c, takvimKur(c))} para yaz={() => true} git={() => undefined} />);
    expect(screen.getByDisplayValue('Deneme gorev')).toBeTruthy();
    expect(screen.queryByLabelText(/brüt/i)).toBeNull();
    expect(container.querySelector('input[name="brut"]')).toBeNull();
    expect(container.textContent).not.toMatch(/1[.\s]?234[.\s]?567|brüt/i);
  });

  it('Ek mesai planı: kişi ücreti girişi ve kişi başı saat maliyeti yok; fazla mesai sayacı kalır', () => {
    const c = brutlu();
    const { container } = kap(<MesaiSayfasi c={c} T={takvimKur(c)} para yaz={() => true} />);
    expect(screen.queryByLabelText(/brüt/i)).toBeNull();
    expect(screen.queryByText('Saat maliyeti')).toBeNull();
    expect(screen.getByText('Fazla mesai sayacı')).toBeTruthy();
    expect(container.textContent).not.toMatch(/1[.\s]?234[.\s]?567|brüt/i);
  });
});
