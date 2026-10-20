import { SAYFA_YOLLARI } from '#paylasilan/sayfalar.ts';

// Sayfanın alt yolları da o sayfaya aittir; hiçbir sayfaya ait olmayan yol null döner.
export function rotaninSayfasi(yol: string): string | null {
  return SAYFA_YOLLARI.find((s) => yol === s || yol.startsWith(`${s}/`)) ?? null;
}
