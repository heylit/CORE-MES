// Eski yapı (legacy): atölyedeki tarayıcılar en yeni sürümde olmayabilir (atölye kroki okuyucusundaki gerekçe).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfIsci from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

// PDF bu cihazda okunur (pdf.js, ayrı iş parçacığı); dışarıya istek yoktur.

let isci: Worker | null = null;
function isciHazirla(): void {
  if (isci) return;
  isci = new PdfIsci();
  GlobalWorkerOptions.workerPort = isci;
}

export function pdfAc(veri: Uint8Array): Promise<PDFDocumentProxy> {
  isciHazirla();
  // pdf.js veriyi iş parçacığına aktarır; kopya verilir, çağıranın dizisi boşalmaz.
  return getDocument({ data: veri.slice() }).promise;
}

// Sayfayı tuvale çizer. `genislik` tuvalin CSS genişliği (piksel); yoğunluk ekranın piksel oranıyla, en çok 2 kat.
export async function sayfaCiz(belge: PDFDocumentProxy, sayfa: number, tuval: HTMLCanvasElement, genislik: number, yakinlik: number): Promise<void> {
  const s = await belge.getPage(Math.min(Math.max(1, sayfa), belge.numPages));
  const gorunum1 = s.getViewport({ scale: 1 });
  const oran = Math.min(window.devicePixelRatio || 1, 2);
  const olcek = (genislik / gorunum1.width) * yakinlik;
  const gorunum = s.getViewport({ scale: olcek * oran });
  tuval.width = Math.ceil(gorunum.width);
  tuval.height = Math.ceil(gorunum.height);
  tuval.style.setProperty('--tuval-en', `${Math.ceil(gorunum.width / oran)}px`);
  await s.render({ canvas: tuval, viewport: gorunum }).promise;
}
