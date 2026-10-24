import { createElement, useMemo, type ReactNode } from 'react';
import './katalog-simgesi.css';

// Prototipin kendi simgeleri (220: ikonlar aynı kalır): tablolardaki SVG parçaları (32x32 kutu) güvenli bir alt kümeyle React
// öğesine çevrilir. Metin HTML olarak basılmaz; yalnız izinli şekil öğeleri ve nitelikleri geçer, olay ve bağlantı niteliği düşer.
const OGELER = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g']);
const NITELIKLER: Record<string, string> = {
  d: 'd', x: 'x', y: 'y', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', cx: 'cx', cy: 'cy', r: 'r', rx: 'rx', ry: 'ry', width: 'width', height: 'height',
  points: 'points', transform: 'transform', opacity: 'opacity', 'stroke-width': 'strokeWidth', 'stroke-dasharray': 'strokeDasharray',
  'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'fill-rule': 'fillRule', class: 'className',
};
// Renk niteliği yalnız simgenin kendi rengine (currentColor) ya da boşa izin verir; sabit renk ekrana girmez.
const RENKLER = new Set(['none', 'currentColor']);

function cevir(dugum: Element, anahtar: string): ReactNode {
  const ad = dugum.tagName.toLowerCase();
  if (!OGELER.has(ad)) return null;
  const nit: Record<string, string> = { key: anahtar };
  for (const a of Array.from(dugum.attributes)) {
    const hedef = NITELIKLER[a.name];
    if (hedef) nit[hedef] = a.value;
    else if ((a.name === 'fill' || a.name === 'stroke') && RENKLER.has(a.value)) nit[a.name] = a.value;
  }
  return createElement(ad, nit, ...Array.from(dugum.children).map((c, i) => cevir(c, `${anahtar}.${String(i)}`)));
}

export function svgParcalari(isaretleme: string): ReactNode[] {
  const belge = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${isaretleme}</svg>`, 'image/svg+xml');
  if (belge.getElementsByTagName('parsererror').length > 0) return [];
  return Array.from(belge.documentElement.children).map((c, i) => cevir(c, String(i)));
}

interface Ozellikler {
  // Prototip tablosundaki SVG parçası (ICON, TUR_ICON, FAM_ICON, OPT_ICON, KAT_ICON ...).
  yol: string | null | undefined;
  boyut?: 'k' | 'o' | 'b';
  // Verilirse simge erişilebilir adla okunur; verilmezse süstür.
  etiket?: string;
}

export function KatalogSimgesi({ yol, boyut = 'o', etiket }: Ozellikler) {
  const parcalar = useMemo(() => (yol ? svgParcalari(yol) : []), [yol]);
  if (parcalar.length === 0) return null;
  return (
    <svg
      className={`tc-ksimge tc-ksimge-${boyut}`}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(etiket ? { role: 'img', 'aria-label': etiket } : { 'aria-hidden': true })}
    >
      {parcalar}
    </svg>
  );
}
