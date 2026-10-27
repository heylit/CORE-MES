import { Color } from 'three';
import type { OmurDurumu, StokDurumu } from './tipler.ts';

// Tuval dokusu, grafik ve sahne renkleri tasarım değişkenlerinden okunur (T1): kodda renk değeri yazılmaz. Prototipin durum
// renkleri (yeşil iyi, sarı yarılandı, turuncu yakında, kırmızı doldu, gri takip yok) ortak durum renklerine eşlenir.
const DEGISKENLER = {
  ok: '--run', warn: '--hazard', crit: '--hold', over: '--stop', na: '--idle',
  yazi: '--ink', soluk: '--muted', silik: '--faint', zemin: '--panel-solid', cizgi: '--edge2', vurgu: '--sahne3b-turuncu',
  mavi: '--done', grafik: '--grafik', grafik2: '--grafik-2', arka: '--sahne-arka', celik: '--sahne3b-celik',
  yazi1: '--font-ana', yazi2: '--font-mono',
} as const;

export type RenkAdi = keyof typeof DEGISKENLER;
export type OmurPaleti = Record<RenkAdi, string>;

export function paletOku(kok: Element = document.documentElement): OmurPaleti {
  const stil = getComputedStyle(kok);
  const p = {} as OmurPaleti;
  for (const [ad, degisken] of Object.entries(DEGISKENLER) as [RenkAdi, string][]) {
    const deger = stil.getPropertyValue(degisken).trim();
    // Değişken yoksa (test ortamı) nötr gri ve sistem yazısı: çizim kurulur, renk uydurulmaz.
    p[ad] = deger !== '' ? deger : ad === 'yazi1' ? 'sans-serif' : ad === 'yazi2' ? 'monospace' : 'rgb(128,128,128)';
  }
  return p;
}

export const durumRengi = (p: OmurPaleti, st: OmurDurumu | StokDurumu['st']): string =>
  st === 'short' ? p.over : st === 'low' ? p.warn : st === 'none' ? p.na : p[st];

export const sahneRengi = (deger: string): Color => {
  const c = new Color();
  try { c.setStyle(deger); } catch { c.setRGB(0.5, 0.5, 0.5); }
  return c;
};

// Tuvalde saydam ton (prototipin `renk + '33'` eki): değişkenin rengi rgba olarak yazılır.
export const saydam = (renk: string, oran: number): string => {
  const h = sahneRengi(renk).getHex();
  return `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${oran})`;
};
