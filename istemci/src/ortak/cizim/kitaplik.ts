import type * as PdfJs from 'pdfjs-dist';
import { calisanOkuyucu, type OcctOkuyucu } from './cekirdek/step-calisani.ts';
import type { OcctSonucu } from './cekirdek.ts';

// Ağır kitaplıklar (pdf.js, Tesseract, OCCT, three) eski Arkon'un kullandığı dosyaların ta kendisidir: arkon/vite.config.ts onları npm
// paketlerinden Arkon'un vendor klasörüne kopyalar, TMI /arkon-mes/ altında sunar (arkon/sun.ts). Yeni paket, CDN ya da dış adres yoktur;
// dosyalar yalnız ihtiyaç anında, bir kez yüklenir. Düşen yükleme sonraki denemede yeniden başlar.

export const VENDOR = `${import.meta.env.BASE_URL}arkon-mes/vendor/`;
const YOLLAR = {
  pdfjs: 'pdfjs/pdf.min.js',
  pdfworker: 'pdfjs/pdf.worker.min.js',
  pdfwasm: 'pdfjs/wasm/',
  three: 'three/three.min.js',
  orbit: 'three/OrbitControls.js',
  occt: 'occt/occt-import-js.js',
  occtwasm: 'occt/occt-import-js.wasm',
  occtcalisan: 'occt/step-calisan.js',
  tesscore: 'tesseract/tesseract-core-simd-lstm.js',
  tesswasm: 'tesseract/tesseract-core-simd-lstm.wasm',
  tesseng: 'tesseract/eng.traineddata.gz',
} as const;
export const vendorAdresi = (k: keyof typeof YOLLAR): string => new URL(VENDOR + YOLLAR[k], document.baseURI).href;

const betikler = new Map<string, Promise<void>>();
function betik(k: keyof typeof YOLLAR): Promise<void> {
  let s = betikler.get(k);
  if (!s) {
    s = new Promise<void>((coz, reddet) => {
      const el = document.createElement('script');
      el.src = vendorAdresi(k);
      el.onload = () => coz();
      el.onerror = () => reddet(new Error(`${YOLLAR[k]} yüklenemedi`));
      document.head.appendChild(el);
    }).catch((h: unknown) => { betikler.delete(k); throw h; });
    betikler.set(k, s);
  }
  return s;
}

async function ikili(k: keyof typeof YOLLAR, gzip = false): Promise<Uint8Array> {
  const r = await fetch(vendorAdresi(k));
  if (!r.ok) throw new Error(`${YOLLAR[k]} yüklenemedi`);
  const u = new Uint8Array(await r.arrayBuffer());
  if (!gzip) return u;
  if (typeof DecompressionStream === 'undefined') throw new Error('Tarayıcı çok eski (DecompressionStream yok). Chrome/Edge güncel sürüm kullanın.');
  const akis = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

const kalici = <T>(f: () => Promise<T>) => {
  let p: Promise<T> | null = null;
  return (): Promise<T> => (p ??= f().catch((h: unknown) => { p = null; throw h; }));
};

/* ── pdf.js 6: ayrıştırma ayrı çalışanda koşar (731): büyük teknik resim açılırken tabletin ekranı donmaz. Çalışan dosyası kendi cevabının
   dar içerik ilkesiyle gelir (arkon/sun.ts). Çalışan kurulamazsa pdf.js aynı dosyayı ana iş parçacığında sahte çalışan olarak yükler
   (eski davranış). JPEG 2000 ve JBIG2 çözücülerinin wasm'sız sürümü kullanılır. ── */
export type PdfKitapligi = typeof PdfJs;
export const pdfjs = kalici(async () => {
  const lib = await (import(/* @vite-ignore */ vendorAdresi('pdfjs')) as Promise<PdfKitapligi>);
  if (typeof Worker === 'undefined') await (import(/* @vite-ignore */ vendorAdresi('pdfworker')) as Promise<unknown>);
  else lib.GlobalWorkerOptions.workerSrc = vendorAdresi('pdfworker');
  return lib;
});
export const pdfWasmAdresi = (): string => vendorAdresi('pdfwasm');

/* ── Tesseract (LSTM, wasm): çevrimdışı OCR ── */
export interface TessApi {
  Init(yol: null, dil: string, kip: number): number;
  SetVariable(ad: string, deger: string): void;
  SetImageFile(a: number, b: number): number;
  SetRectangle(x: number, y: number, w: number, h: number): void;
  Recognize(m: null): void;
  GetTSVText(n: number): string;
  GetBoxText(n: number): string;
}
export interface TessModulu { FS: { writeFile(yol: string, veri: Uint8Array): void }; TessBaseAPI: new () => TessApi }
type TessKurucu = (a: { wasmBinary: Uint8Array; print(): void; printErr(): void }) => Promise<TessModulu>;
export const tesseract = kalici(async () => {
  await betik('tesscore');
  const wasm = await ikili('tesswasm');
  const kurucu = (window as unknown as { TesseractCore?: TessKurucu }).TesseractCore;
  if (!kurucu) throw new Error('OCR motoru yüklenemedi');
  const TM = await kurucu({ wasmBinary: wasm, print() {}, printErr() {} });
  TM.FS.writeFile('/eng.traineddata', await ikili('tesseng', true));
  const api = new TM.TessBaseAPI();
  if (api.Init(null, 'eng', 1) === -1) throw new Error('OCR modeli yüklenemedi');
  api.SetVariable('tessedit_pageseg_mode', '11');
  api.SetVariable('user_defined_dpi', '300');
  api.SetVariable('debug_file', '/dev/null');
  return { TM, api };
});

/* ── OCCT (STEP/IGES): okuyucu ayrı çalışanda koşar (kendi içerik ilkesiyle, step-calisan.js); çalışan yoksa ana iş parçacığında ── */
export interface Occt {
  ReadStepFile(bytes: Uint8Array, ayar: unknown): Promise<OcctSonucu>;
  ReadIgesFile(bytes: Uint8Array, ayar: null): Promise<OcctSonucu>;
}
type OcctKurucu = (a: { wasmBinary: ArrayBuffer }) => Promise<OcctOkuyucu>;
export const occt = kalici(async (): Promise<Occt> => {
  const wasm = await ikili('occtwasm');
  if (typeof Worker !== 'undefined') return calisanOkuyucu(new Worker(vendorAdresi('occtcalisan')), wasm.buffer as ArrayBuffer);
  await betik('occt');
  const kurucu = (window as unknown as { occtimportjs?: OcctKurucu }).occtimportjs;
  if (!kurucu) throw new Error('STEP okuyucu yüklenemedi');
  const m = await kurucu({ wasmBinary: wasm.buffer as ArrayBuffer });
  return { ReadStepFile: async (b, a) => m.ReadStepFile(b, a), ReadIgesFile: async (b) => m.ReadIgesFile(b, null) };
});

/* ── three (r147) ve OrbitControls: 3B görünüm ── */
export const three = kalici(async () => {
  await betik('three');
  await betik('orbit');
  const T = (window as unknown as { THREE?: unknown }).THREE;
  if (!T) throw new Error('3B kitaplığı yüklenemedi');
  return T;
});

export const bekle = (ms = 30): Promise<void> => new Promise((coz) => { setTimeout(coz, ms); });
