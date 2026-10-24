// Eski yapı (legacy): atölyedeki tarayıcılar en yeni sürümde olmayabilir (çizimler modülündeki gerekçe).
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfIsci from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

// PDF bu cihazda okunur (pdf.js, ayrı iş parçacığı); dışarıya istek yoktur.
let isci: Worker | null = null;
function isciHazirla(): void {
  if (isci) return;
  isci = new PdfIsci();
  GlobalWorkerOptions.workerPort = isci;
}

function tuval(en: number, boy: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(en);
  c.height = Math.round(boy);
  return c;
}

// Sayfaları beyaz zeminli JPEG resme çevirir (FAI paketindeki ek belgeler ve balonlu resim).
export async function pdfSayfalari(blob: Blob, enCokSayfa: number, genislik: number): Promise<{ resimler: string[]; tuvaller: HTMLCanvasElement[]; en: number; boy: number }> {
  isciHazirla();
  const gorev = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const belge = await gorev.promise;
  const resimler: string[] = [];
  const tuvaller: HTMLCanvasElement[] = [];
  let en = 0;
  let boy = 0;
  try {
    for (let i = 1; i <= Math.min(belge.numPages, enCokSayfa); i++) {
      const s = await belge.getPage(i);
      const g1 = s.getViewport({ scale: 1 });
      if (i === 1) { en = g1.width; boy = g1.height; }
      const g = s.getViewport({ scale: genislik / g1.width });
      const c = tuval(g.width, g.height);
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, c.width, c.height);
      await s.render({ canvas: c, canvasContext: ctx, viewport: g }).promise;
      tuvaller.push(c);
      resimler.push(c.toDataURL('image/jpeg', 0.82));
    }
  } finally {
    void gorev.destroy();
  }
  return { resimler, tuvaller, en, boy };
}
