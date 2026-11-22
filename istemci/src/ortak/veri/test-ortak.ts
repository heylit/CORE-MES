import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import bwipjs from 'bwip-js/browser';
import qrcode from 'qrcode-generator';
import { motorAyari, type Goruntu } from './matris-okuyucu.ts';

// Yardımcı: uret-oku testlerinin kod çizicisi. Üretici bwip-js (devDependency; üretim kodu sonraki dilimde ekler), okuyucu ayrı paket olduğundan uret-oku gerçek bir sınamadır.
const MODUL = 6;
const SESSIZ = 4;
function cizim(koyu: (s: number, k: number) => boolean, en: number, boy: number): Goruntu {
  const g = (en + 2 * SESSIZ) * MODUL;
  const y = (boy + 2 * SESSIZ) * MODUL;
  const data = new Uint8ClampedArray(g * y * 4).fill(255);
  for (let s = 0; s < boy; s++) for (let k = 0; k < en; k++) {
    if (!koyu(s, k)) continue;
    for (let dy = 0; dy < MODUL; dy++) for (let dx = 0; dx < MODUL; dx++) {
      const i = (((s + SESSIZ) * MODUL + dy) * g + (k + SESSIZ) * MODUL + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, width: g, height: y };
}
export function bwip(bcid: 'datamatrix' | 'qrcode', text: string): Goruntu {
  // 2B simgelerde raw() piksel matrisi döndürür (çizgisel kodlarda çubuk listesi); tür bu ayrımı bilmez.
  const r = bwipjs.raw({ bcid, text })[0] as { pixs: number[]; pixx: number; pixy: number };
  return cizim((s, k) => r.pixs[s * r.pixx + k] === 1, r.pixx, r.pixy);
}
export function eskiQr(text: string): Goruntu {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const n = q.getModuleCount();
  return cizim((s, k) => q.isDark(s, k), n, n);
}

// Testte wasm motoru ağdan değil paketten verilir (jsdom'da dosya adresi açılmaz); üretim kodu bunu çağırmaz.
export function motoruHazirla(): void {
  motorAyari.wasmBinary = new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm')));
}
