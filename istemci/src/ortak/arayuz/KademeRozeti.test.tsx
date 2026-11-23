import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KADEME_ADLARI, KADEMELER } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import '../tasarim/tokens.css';
import { KademeRozeti, kademeMetni } from './KademeRozeti.tsx';

afterEach(cleanup);

const kanallar = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const parlaklik = (c: number[]): number => {
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const oran = (a: number[], b: number[]): number => { const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

const tema = (ad: 'dark' | 'light') => (anahtar: string): string => {
  document.documentElement.setAttribute('data-theme', ad);
  return getComputedStyle(document.documentElement).getPropertyValue(`--${anahtar}`).trim();
};
const KADEME_RENGI: Record<number, string> = { 1: 'idle', 2: 'done', 3: 'hold', 4: 'stop', 5: 'stop' };

describe('KademeRozeti', () => {
  it('her kademe katalogdaki adla ve numarasıyla yazılır; bilinmeyen kademe adsız ama numaralı çizilir', () => {
    render(<>{KADEMELER.map((k) => <KademeRozeti key={k} kademe={k} />)}<KademeRozeti kademe={9} /></>);
    for (const k of KADEMELER) expect(screen.getByText(`K${String(k)} ${KADEME_ADLARI[k]}`).getAttribute('data-kademe')).toBe(String(k));
    expect(screen.getByText('K9').getAttribute('data-kademe')).toBe('bilinmiyor');
    expect(kademeMetni(null)).toBe('');
    expect(kademeMetni(3)).toBe('K3 Gecikti');
  });

  it.each([['dark'], ['light']] as const)('%s temada yazı ile dolgu arasında 4,5:1 vardır (her kademe)', (ad) => {
    const t = tema(ad);
    expect(t('ink')).toMatch(/^#[0-9a-f]{6}$/i);
    for (const k of KADEMELER) {
      const c = kanallar(t(KADEME_RENGI[k]!));
      const zemin = kanallar(t('bg2'));
      const dolgu = c.map((v, i) => 0.18 * v + 0.82 * zemin[i]!);
      expect(oran(kanallar(t('ink')), dolgu), `K${String(k)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
