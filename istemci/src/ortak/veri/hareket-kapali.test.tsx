import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AcilisGosterisi } from '../arayuz/Acilis.tsx';
import { etkinHareket, gosteriKur, performansYaz, performansiSifirla, useGosteri } from './gorunum.ts';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-hareket');
  try { localStorage.clear(); } catch { /* yok */ }
  performansiSifirla();
});

describe('hareket dili kapalı', () => {
  it('performans modu kapalıyı sadeye çevirmez; öteki seviyeleri sadeye indirir', () => {
    expect(etkinHareket('kapali', true)).toBe('kapali');
    expect(etkinHareket('kapali', false)).toBe('kapali');
    expect(etkinHareket('ultra', true)).toBe('sade');
    expect(etkinHareket('orta', false)).toBe('orta');
  });

  it('kapalıyken açılış gösterisi oynamaz ve hemen biter', () => {
    performansYaz(false);
    document.documentElement.setAttribute('data-hareket', 'kapali');
    let son: unknown = 'yok';
    function Izle() { [son] = useGosteri(); return null; }
    render(<><AcilisGosterisi /><Izle /></>);
    act(() => { gosteriKur('tezgah', 1, null, false); });
    expect(document.querySelector('.tc-acilis-gosterisi')).toBeNull();
    expect(son).toBeNull();
  });
});
