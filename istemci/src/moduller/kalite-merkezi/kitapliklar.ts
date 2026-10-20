import type { KitaplikKimligi, PdfWasmDosyasi } from './sayfa.ts';

// Uygulamanın gömülü kitaplıkları depodaki paketlerden gelir (pdf.js dışındakiler KaliteMerkezi.html'dekilerle bayt bayt aynı sürümler; NOTLAR.md):
// three.js r147 ve OrbitControls, pdf.js 6.4.299 (eski yapı, ES modülü; JPEG 2000 ve JBIG2 çözücü wasm'ı), occt-import-js 0.0.23, Chart.js 4.4.1. Yazı tanıma kitaplıkları depoda aynı
// sürümle yok; uygulamadan alınmış hâlleri `uygulama/ocr.ts` ve `uygulama/ocr-cekirdek.ts`'tedir.
export interface Kitapliklar {
  grafik: string;
  lib: Record<KitaplikKimligi, string>;
  pdfWasm: Record<PdfWasmDosyasi, string>;
}

const metin = (m: { default: string }): string => m.default;

async function base64(adres: string): Promise<string> {
  const blob = await (await fetch(adres)).blob();
  const veri = await new Promise<string>((ok, red) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => { ok(String(okuyucu.result)); };
    okuyucu.onerror = () => { red(okuyucu.error ?? new Error('okunamadı')); };
    okuyucu.readAsDataURL(blob);
  });
  return veri.slice(veri.indexOf(',') + 1);
}

export async function kitapliklariYukle(): Promise<Kitapliklar> {
  const [grafik, three, orbit, pdf, pdfw, occt, occtUrl, ocr, ocrCekirdek, jpxUrl, jbig2Url] = await Promise.all([
    import('../../../../node_modules/chart.js/dist/chart.umd.js?raw').then(metin),
    import('../../../../node_modules/three-147/build/three.min.js?raw').then(metin),
    import('../../../../node_modules/three-147/examples/js/controls/OrbitControls.js?raw').then(metin),
    import('../../../../node_modules/pdfjs-dist/legacy/build/pdf.min.mjs?raw').then(metin),
    import('../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw').then(metin),
    import('../../../../node_modules/occt-import-js/dist/occt-import-js.js?raw').then(metin),
    import('../../../../node_modules/occt-import-js/dist/occt-import-js.wasm?url').then(metin),
    import('./uygulama/ocr.ts'),
    import('./uygulama/ocr-cekirdek.ts'),
    import('../../../../node_modules/pdfjs-dist/wasm/openjpeg.wasm?url').then(metin),
    import('../../../../node_modules/pdfjs-dist/wasm/jbig2.wasm?url').then(metin),
  ]);
  return {
    grafik,
    lib: {
      'lib-three': three, 'lib-orbit': orbit, 'lib-pdf': pdf, 'lib-pdfw': pdfw, 'lib-occt': occt, 'lib-occtwasm': await base64(occtUrl),
      ...ocr.KM_OCR_KITAPLIKLARI,
      ...ocrCekirdek.KM_OCR_CEKIRDEGI,
    },
    pdfWasm: { 'openjpeg.wasm': await base64(jpxUrl), 'jbig2.wasm': await base64(jbig2Url) },
  };
}
