import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AletTuru, aletSimgesiSec } from './alet-simgeleri.tsx';

afterEach(() => { cleanup(); });

// Göçle gelen başlangıç türleri (20261006104020_kalibrasyon_tablolar.sql): her biri kendi simgesini alır.
const BASLANGIC = [
  ['Mikrometre', 'mikrometre'], ['Kumpas', 'kumpas'], ['Komparatör', 'komparator'], ['Tampon mastar', 'tampon-mastar'],
  ['Halka mastar', 'halka-mastar'], ['Diş mastarı', 'dis-mastari'], ['Radyus mastarı', 'radyus-mastari'],
  ['Yükseklik mihengiri', 'yukseklik-mihengiri'], ['İç çap mikrometresi', 'ic-cap-mikrometresi'], ['CMM', 'cmm'],
  ['Tork anahtarı', 'tork-anahtari'], ['Kaplama kalınlık ölçer', 'kaplama-kalinlik-olcer'],
] as const;

describe('ölçü aleti simgeleri', () => {
  it('başlangıç türlerinin her biri kendi simgesini alır; simgeler birbirinden farklıdır', () => {
    for (const [tur, simge] of BASLANGIC) expect(aletSimgesiSec(tur), tur).toBe(simge);
    expect(new Set(BASLANGIC.map(([tur]) => aletSimgesiSec(tur))).size).toBe(BASLANGIC.length);
  });

  it('büyük küçük harf, Türkçe harf ve boşluk eşlemeyi bozmaz; özel ad genelden önce gelir', () => {
    expect(aletSimgesiSec('DİJİTAL KUMPAS')).toBe('kumpas');
    expect(aletSimgesiSec('ic cap mikrometresi')).toBe('ic-cap-mikrometresi');
    expect(aletSimgesiSec('DIŞ MASTARI M8')).toBe('dis-mastari');
    expect(aletSimgesiSec('komparator')).toBe('komparator');
  });

  it('tanınmayan ya da boş türde genel simge çıkar', () => {
    expect(aletSimgesiSec('Lazer ölçer')).toBe('genel');
    expect(aletSimgesiSec('Mastar')).toBe('genel');
    expect(aletSimgesiSec('')).toBe('genel');
  });

  it('tür adı simgesiyle yan yana yazılır; simge ekran okuyucudan gizlidir', () => {
    const { container } = render(<AletTuru tur="Kumpas" />);
    const simge = container.querySelector('svg');
    expect(simge?.getAttribute('data-alet-simgesi')).toBe('kumpas');
    expect(simge?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('Kumpas');
  });
});
