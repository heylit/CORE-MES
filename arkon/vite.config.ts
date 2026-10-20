import type { Plugin, UserConfig } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Arkon MES arayüzü değiştirilmeden derlenir (web/, shared/). Çıktı arkon/dist; TMI istemcisi onu /arkon-mes/ altında sunar (arkon/sun.ts).
const kok = fileURLToPath(new URL('.', import.meta.url));
const modul = (yol: string) => fileURLToPath(new URL(`../node_modules/${yol}`, import.meta.url));

// Ağır kütüphaneler Arkon'un beklediği yollara npm paketlerinden kopyalanır (pdf.js dışındakiler Arkon'un vendor dosyalarıyla bayt bayt aynıdır).
// pdf.js 6 ES modülüdür; .js adıyla kopyalanır ki her sunucu betik türüyle versin. Eski yapı (legacy): atölye tabletleri en yeni tarayıcıda olmayabilir.
// JPEG 2000 ve JBIG2 çözücüleri pdf.js 3'te içerideydi, 6'da ayrı dosyadır: wasm'sız sürümleri kopyalanır (pdf.ts).
const KUTUPHANELER: readonly (readonly [string, string])[] = [
  ['pdfjs-dist/legacy/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.js'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.js'],
  ['pdfjs-dist/wasm/openjpeg_nowasm_fallback.js', 'vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js'],
  ['pdfjs-dist/wasm/jbig2_nowasm_fallback.js', 'vendor/pdfjs/wasm/jbig2_nowasm_fallback.js'],
  ['pdfjs-dist/LICENSE', 'vendor/licenses/pdfjs.LICENSE'],
  ['pdfjs-dist/wasm/LICENSE_OPENJPEG', 'vendor/licenses/pdfjs-openjpeg.LICENSE'],
  ['pdfjs-dist/wasm/LICENSE_PDFJS_OPENJPEG', 'vendor/licenses/pdfjs-openjpeg-baglama.LICENSE'],
  ['pdfjs-dist/wasm/LICENSE_JBIG2', 'vendor/licenses/pdfjs-jbig2.LICENSE'],
  ['pdfjs-dist/wasm/LICENSE_PDFJS_JBIG2', 'vendor/licenses/pdfjs-jbig2-baglama.LICENSE'],
  ['three-147/build/three.min.js', 'vendor/three/three.min.js'],
  ['three-147/examples/js/controls/OrbitControls.js', 'vendor/three/OrbitControls.js'],
  ['three-147/LICENSE', 'vendor/licenses/three.LICENSE'],
  ['occt-import-js/dist/occt-import-js.js', 'vendor/occt/occt-import-js.js'],
  ['occt-import-js/dist/occt-import-js.wasm', 'vendor/occt/occt-import-js.wasm'],
  ['occt-import-js/LICENSE.md', 'vendor/licenses/occt-import-js.LICENSE.md'],
  ['tesseract.js-core/tesseract-core-simd-lstm.js', 'vendor/tesseract/tesseract-core-simd-lstm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'vendor/tesseract/tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core/LICENSE', 'vendor/licenses/tesseract-core.LICENSE'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'vendor/tesseract/eng.traineddata.gz'],
  ['jsqr/dist/jsQR.js', 'vendor/qr/jsQR.js'],
  ['jsqr/LICENSE', 'vendor/licenses/jsqr.LICENSE'],
  ['qrcode-generator/qrcode.js', 'vendor/qr/qrcode.js'],
  ['htm/LICENSE', 'vendor/licenses/htm.LICENSE'],
];

// Arkon'un kendi çalışan dosyaları (derlenmez, olduğu gibi kopyalanır): STEP okuyucu çalışanı kendi içerik ilkesiyle sunulur (arkon/sun.ts).
const CALISANLAR: readonly (readonly [string, string])[] = [
  ['web/calisan/step-calisan.js', 'vendor/occt/step-calisan.js'],
];

function kutuphaneleriKopyala(hedef: string): Plugin {
  return {
    name: 'arkon-kutuphaneler',
    apply: 'build',
    async closeBundle() {
      for (const [kaynak, yer] of [...KUTUPHANELER.map(([k, y]) => [modul(k), y] as const), ...CALISANLAR.map(([k, y]) => [join(kok, k), y] as const)]) {
        const varis = join(hedef, yer);
        await mkdir(dirname(varis), { recursive: true });
        await copyFile(kaynak, varis);
      }
    },
  };
}

const cikti = join(kok, 'dist');
const yaziTipleri = fileURLToPath(new URL('../istemci/src/ortak/tasarim/fonts/', import.meta.url));

export default {
  root: join(kok, 'web'),
  base: './',
  publicDir: false,
  resolve: {
    alias: [
      { find: '@shared', replacement: join(kok, 'shared') },
      // Arkon'un yazı tipleri TMI'dekilerle aynı dosyalardır; ikinci kopya tutulmaz.
      { find: /^\.\.\/assets\/fonts\/(.*)$/, replacement: `${yaziTipleri}$1` },
    ],
  },
  plugins: [kutuphaneleriKopyala(cikti)],
  // Arkon kaynağındaki U+FFFD gibi karakterler kaçış dizisi kalır (Arkon'un kendi derleme ayarı).
  esbuild: { charset: 'ascii' },
  build: { outDir: cikti, emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 4000 },
} satisfies UserConfig;
