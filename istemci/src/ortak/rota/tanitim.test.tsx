import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { tanitimKonulari, tanitimKonulariTopla } from './tanitim.ts';

const Bos = () => null;
const konu = (anahtar: string, sira = 1) => ({ anahtar, sira, baslik: anahtar, alt: 'Deneme', simge: 'play', icerik: Bos });

describe('tanıtım konuları (3536)', () => {
  it('modüllerin konularını sıraya, eşitte anahtara göre toplar; Kokpit plan modülündendir', () => {
    const t = tanitimKonulariTopla({ 'b/tanitim.tsx': { tanitimKonulari: [konu('b', 2), konu('c', 1)] }, 'a/tanitim.tsx': { tanitimKonulari: [konu('a', 1)] } });
    expect(t.map((k) => k.anahtar)).toEqual(['a', 'c', 'b']);
    expect(tanitimKonulari.map((k) => k.anahtar)).toContain('kokpit');
  });

  it('yanlış bildirilen konu açılışta dosyasıyla düşer', () => {
    expect(() => tanitimKonulariTopla({ 'x/tanitim.tsx': {} })).toThrow(/x\/tanitim.tsx/);
    expect(() => tanitimKonulariTopla({ 'x/tanitim.tsx': { tanitimKonulari: [konu('Büyük')] } })).toThrow(/biçime uymuyor/);
    expect(() => tanitimKonulariTopla({ 'x/tanitim.tsx': { tanitimKonulari: [{ ...konu('a'), simge: 'yok' }] } })).toThrow(/simgesi/);
    expect(() => tanitimKonulariTopla({ 'x/tanitim.tsx': { tanitimKonulari: [{ ...konu('a'), icerik: null }] } })).toThrow(/bileşeni/);
    expect(() => tanitimKonulariTopla({ 'x/tanitim.tsx': { tanitimKonulari: [konu('a')] }, 'y/tanitim.tsx': { tanitimKonulari: [konu('a')] } })).toThrow(/iki tanıtım/);
  });

  it('her konu yalnız örnek veriyle çizer, sunucuya istek atmaz (sayfa yetki istemediği için)', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      for (const k of tanitimKonulari) { render(createElement(k.icerik)); cleanup(); }
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
