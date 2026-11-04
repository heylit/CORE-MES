import { afterEach, describe, expect, it } from 'vitest';
import { ETKI_OZNITELIGI, etkileriUygula } from './gorunum.ts';

const kok = document.documentElement;
afterEach(() => { kok.removeAttribute(ETKI_OZNITELIGI); });

describe('etkileşim etkileri kökte (kart 2086)', () => {
  it('kapalı olanlar boşlukla ayrılmış yazılır; hepsi açık ya da alan yoksa öznitelik kalkar', () => {
    etkileriUygula({ 'grafik-hareket': true, 'deger-balonu': false, dalga: false, 'gantt-yardim': true, 'gantt-kayma': true, 'durdur-basili': true });
    expect(kok.getAttribute(ETKI_OZNITELIGI)).toBe('deger-balonu dalga');
    etkileriUygula({ 'grafik-hareket': true, 'deger-balonu': true, dalga: true, 'gantt-yardim': true, 'gantt-kayma': true, 'durdur-basili': true });
    expect(kok.hasAttribute(ETKI_OZNITELIGI)).toBe(false);
    kok.setAttribute(ETKI_OZNITELIGI, 'dalga');
    etkileriUygula(undefined);
    expect(kok.hasAttribute(ETKI_OZNITELIGI)).toBe(false);
  });
});
