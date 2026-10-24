import { QR_SESSIZ_PAY, qrKareleri } from '../../../../ortak/arayuz/index.ts';
import type { Pkg } from './tipler.ts';

const kac = (s: unknown): string => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// 60x30 mm parça etiketi (istasyonlar.ts labelSvg): solda seri numarasının QR'ı, sağda seri, parça adı, parça no ve revizyon, ek satır.
// Kâğıda basılır; renk temadan değil, baskı için sabit siyah-beyazdır.
export function etiketSvg(seri: string, p: Partial<Pick<Pkg, 'part' | 'partNo' | 'rev'>>, ek?: string | null): string {
  const { modul, yol } = qrKareleri(seri);
  const k = modul + 2 * QR_SESSIZ_PAY;
  return '<svg class="lbl" xmlns="http://www.w3.org/2000/svg" width="60mm" height="30mm" viewBox="0 0 600 300"><rect width="600" height="300" fill="#fff" stroke="#000" stroke-width="3" rx="12"/>'
    + '<svg x="20" y="20" width="260" height="260" viewBox="0 0 ' + k + ' ' + k + '" shape-rendering="crispEdges"><rect width="' + k + '" height="' + k + '" fill="#fff"/><path d="' + yol + '" fill="#000"/></svg>'
    + '<text x="300" y="80" font-family="monospace" font-size="34" font-weight="700">' + kac(seri) + '</text>'
    + '<text x="300" y="130" font-family="sans-serif" font-size="26">' + kac(p.part) + '</text>'
    + '<text x="300" y="170" font-family="sans-serif" font-size="22" fill="#444">' + kac(p.partNo) + ' · Rev ' + kac(p.rev) + '</text>'
    + '<text x="300" y="250" font-family="sans-serif" font-size="20" fill="#444">' + kac(ek || new Date().toLocaleDateString('tr-TR')) + '</text></svg>';
}

export function etiketBelgesi(svgler: readonly string[]): string {
  return '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Etiket</title><style>@page{size:60mm 30mm;margin:0}body{margin:0;background:#fff}'
    + 'svg.lbl{display:block;width:60mm;height:30mm;break-after:page}</style></head><body>' + svgler.join('') + '</body></html>';
}

// Basım ayrı, görünmeyen belgede yapılır (stok/LotEtiketi.tsx yazdir gibi): sayfanın kendisi kâğıda çıkmaz.
export function etiketYazdir(svgler: readonly string[]): void {
  const cerceve = document.createElement('iframe');
  cerceve.setAttribute('aria-hidden', 'true');
  cerceve.className = 'tc-ay2-gizli-cerceve';
  document.body.appendChild(cerceve);
  const belge = cerceve.contentDocument;
  if (!belge || !cerceve.contentWindow) { cerceve.remove(); return; }
  belge.open(); belge.write(etiketBelgesi(svgler)); belge.close();
  try { cerceve.contentWindow.focus(); cerceve.contentWindow.print(); } catch { /* yazdırma kapalı: sessiz geçer, eskisi gibi */ }
  setTimeout(() => cerceve.remove(), 60_000);
}
