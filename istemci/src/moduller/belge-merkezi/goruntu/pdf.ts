// Eski yapı (legacy): atölyedeki tarayıcılar en yeni sürümde olmayabilir (atölye kroki okuyucusundaki gerekçe).
import { GlobalWorkerOptions, RenderingCancelledException, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfIsci from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';
import { tuvalYogunlugu } from './tuval-siniri.ts';

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

const suren = new WeakMap<HTMLCanvasElement, RenderTask>();

// Sayfayı tuvale çizer. `genislik` tuvalin %100'deki CSS genişliği (piksel); yoğunluk ekranın piksel oranıyla, en çok 2 kat.
// Aynı tuvale süren çizim iptal edilir (art arda yakınlaştırma); iptal edilen çizim false döner.
export async function sayfaCiz(belge: PDFDocumentProxy, sayfa: number, tuval: HTMLCanvasElement, genislik: number, yakinlik: number): Promise<boolean> {
  suren.get(tuval)?.cancel();
  const s = await belge.getPage(Math.min(Math.max(1, sayfa), belge.numPages));
  const gorunum1 = s.getViewport({ scale: 1 });
  const oran = Math.min(window.devicePixelRatio || 1, 2);
  const olcek = (genislik / gorunum1.width) * yakinlik;
  const gorunum = s.getViewport({ scale: tuvalYogunlugu(gorunum1.width, gorunum1.height, olcek * oran) });
  suren.get(tuval)?.cancel();
  tuval.width = Math.ceil(gorunum.width);
  tuval.height = Math.ceil(gorunum.height);
  tuval.style.setProperty('--tuval-en', `${String(Math.ceil(gorunum1.width * olcek))}px`);
  const gorev = s.render({ canvas: tuval, viewport: gorunum });
  suren.set(tuval, gorev);
  try {
    await gorev.promise;
    return true;
  } catch (e) {
    if (e instanceof RenderingCancelledException) return false;
    throw e;
  } finally {
    if (suren.get(tuval) === gorev) suren.delete(tuval);
  }
}
