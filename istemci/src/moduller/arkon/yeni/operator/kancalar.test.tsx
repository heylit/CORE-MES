import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ArkonDarAlanKaynagi } from '../veri/baglam.ts';
import { useDarEkran } from './kancalar.ts';

const ilkGenislik = window.innerWidth;
const ilkYukseklik = window.innerHeight;
const pencere = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
};
const alanla = (dar: boolean | null) => ({ children }: { children: ReactNode }) => createElement(ArkonDarAlanKaynagi.Provider, { value: dar }, children);

describe('useDarEkran', () => {
  afterEach(() => pencere(ilkGenislik, ilkYukseklik));

  it('menü açıkken 1024 pencerede ölçülen alan darsa tablet düzeni seçilir', () => {
    pencere(1024, 700);
    expect(renderHook(() => useDarEkran(), { wrapper: alanla(true) }).result.current).toBe(true);
  });

  it('ölçülen alan genişse dar pencere geniş düzeni bozmaz', () => {
    pencere(800, 700);
    expect(renderHook(() => useDarEkran(), { wrapper: alanla(false) }).result.current).toBe(false);
  });

  it('alan ölçülmemişse pencere genişliğine düşer', () => {
    pencere(1280, 800);
    expect(renderHook(() => useDarEkran(), { wrapper: alanla(null) }).result.current).toBe(false);
    pencere(800, 700);
    expect(renderHook(() => useDarEkran()).result.current).toBe(true);
  });
});
