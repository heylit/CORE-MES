// Eski yapı (legacy): atölyedeki tarayıcılar en yeni sürümde olmayabilir; yeni yapı yeni dil özelliklerini (ör.
// Map.getOrInsertComputed) dolgusuz kullanır ve Chrome 141'de açılmadı (DOĞRULANDI: önizlemede hata).
import { GlobalWorkerOptions, OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfIsci from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';
import { cizgileriCikar } from '../kroki.ts';

// Kroki PDF'i bu cihazda okunur (pdf.js, ayrı iş parçacığı): sayfa görüntüye çizilir, düz çizgileri yapışma için
// çıkarılır. Dosya sunucuya gönderilmeden de okunabilir (yüklemeden önce sayfa seçimi). Yalnız düzenleyici açılınca iner.

// pdf.js yol kodları (DrawOPS) dışa açık değil; 6.x sürümündeki değerler. Sürüm değişince `kroki.test.ts`'deki
// yol çözümü ve önizlemedeki kroki birlikte denenir.
const YOL_KODLARI = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

let isci: Worker | null = null;
function isciHazirla(): void {
  if (isci) return;
  isci = new PdfIsci();
  GlobalWorkerOptions.workerPort = isci;
}

export interface KrokiSayfasi {
  // Sayfanın punto ölçüsü (pdf.js görünümü, ölçek 1).
  genislik: number;
  yukseklik: number;
  // Sayfanın görüntüsü (bellekteki nesne adresi; işi bitince bırakılır).
  url: string;
  // Düz çizgiler: u1 v1 u2 v2 ... (punto)
  cizgiler: Float32Array;
  sayfaSayisi: number;
}

async function ac(veri: Uint8Array): Promise<PDFDocumentProxy> {
  isciHazirla();
  // pdf.js veriyi iş parçacığına aktarır (kopya verilir, çağıranın dizisi boşalmaz).
  return getDocument({ data: veri.slice() }).promise;
}

export async function pdfSayfaSayisi(veri: Uint8Array): Promise<number> {
  const belge = await ac(veri);
  try {
    return belge.numPages;
  } finally {
    void belge.loadingTask.destroy();
  }
}

// Görüntü uzun kenarı en çok `azamiPiksel`: büyük çizimde bellek sınırlı kalır, ince çizgiler vektörden çizilir.
export async function krokiSayfasiOku(veri: Uint8Array, sayfa: number, azamiPiksel = 4096): Promise<KrokiSayfasi> {
  const belge = await ac(veri);
  try {
    const s = await belge.getPage(Math.min(Math.max(1, sayfa), belge.numPages));
    const gorunum1 = s.getViewport({ scale: 1 });
    const olcek = Math.min(4, azamiPiksel / Math.max(gorunum1.width, gorunum1.height));
    const gorunum = s.getViewport({ scale: olcek });
    const tuval = document.createElement('canvas');
    tuval.width = Math.ceil(gorunum.width);
    tuval.height = Math.ceil(gorunum.height);
    await s.render({ canvas: tuval, viewport: gorunum }).promise;
    const blob = await new Promise<Blob | null>((coz) => tuval.toBlob(coz, 'image/png'));
    tuval.width = 0;
    tuval.height = 0;
    if (!blob) throw new Error('Kroki görüntüsü oluşturulamadı.');
    const liste = await s.getOperatorList();
    const cizgiler = cizgileriCikar(
      liste.fnArray, liste.argsArray,
      {
        save: OPS.save, restore: OPS.restore, transform: OPS.transform, constructPath: OPS.constructPath, endPath: OPS.endPath,
        paintFormXObjectBegin: OPS.paintFormXObjectBegin, paintFormXObjectEnd: OPS.paintFormXObjectEnd,
      },
      YOL_KODLARI,
      gorunum1.transform,
    );
    return { genislik: gorunum1.width, yukseklik: gorunum1.height, url: URL.createObjectURL(blob), cizgiler, sayfaSayisi: belge.numPages };
  } finally {
    void belge.loadingTask.destroy();
  }
}
