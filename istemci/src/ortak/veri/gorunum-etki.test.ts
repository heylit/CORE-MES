import { afterEach, describe, expect, it } from 'vitest';
import { ETKI_OZNITELIGI, etkileriUygula } from './gorunum.ts';

const kok = document.documentElement;
const YENI_ACIK = { 'pencere-kayma': true, 'pencere-cekme': true, 'sekme-cizgi': true, 'menu-gecis': true, 'bildirim-kayma': true, 'hizli-artis': true, 'satir-kaydirma': true, 'tablo-iskelet': true, 'kopyala': true };
afterEach(() => { kok.removeAttribute(ETKI_OZNITELIGI); });

describe('etkileşim etkileri kökte (kart 2086)', () => {
  it('kapalı olanlar boşlukla ayrılmış yazılır; hepsi açık ya da alan yoksa öznitelik kalkar', () => {
    etkileriUygula({ 'grafik-hareket': true, 'deger-balonu': false, dalga: false, 'gantt-yardim': true, 'gantt-kayma': true, 'durdur-basili': true, ...YENI_ACIK });
    expect(kok.getAttribute(ETKI_OZNITELIGI)).toBe('deger-balonu dalga');
    etkileriUygula({ 'grafik-hareket': true, 'deger-balonu': true, dalga: true, 'gantt-yardim': true, 'gantt-kayma': true, 'durdur-basili': true, ...YENI_ACIK });
    expect(kok.hasAttribute(ETKI_OZNITELIGI)).toBe(false);
    kok.setAttribute(ETKI_OZNITELIGI, 'dalga');
    etkileriUygula(undefined);
    expect(kok.hasAttribute(ETKI_OZNITELIGI)).toBe(false);
  });
});
