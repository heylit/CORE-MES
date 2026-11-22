// Kamera görüntüsünden DataMatrix ve QR okuma (zxing-wasm). Windows'ta tarayıcının BarcodeDetector'ü yoktur; eski jsqr yalnız QR okur.
// Motor paketin kendi wasm dosyasıdır ve uygulamayla birlikte kendi kökeninden gelir: paket varsayılan olarak wasm'ı CDN'den ister
// (kırmızı çizgi: CDN yok), bu yüzden adres her zaman burada verilir. Kitaplık ve wasm yalnız ilk okumada, bir kez yüklenir.
import type { prepareZXingModule as Hazirla, readBarcodes as Oku, ReaderOptions } from 'zxing-wasm/reader';

export type Goruntu = Pick<ImageData, 'data' | 'width' | 'height'>;

// Testte wasm dosyası ağdan değil diskten verilir; üretimde boş kalır.
export const motorAyari: { wasmBinary: Uint8Array | null } = { wasmBinary: null };

interface Kitaplik { readBarcodes: typeof Oku; prepareZXingModule: typeof Hazirla }
let yuklenen: Promise<Kitaplik> | null = null;
function yukle(): Promise<Kitaplik> {
  yuklenen ??= (async () => {
    const kitap = await import('zxing-wasm/reader');
    if (motorAyari.wasmBinary) {
      kitap.prepareZXingModule({ overrides: { wasmBinary: motorAyari.wasmBinary as unknown as ArrayBuffer } });
    } else {
      const { default: wasmAdresi } = await import('zxing-wasm/reader/zxing_reader.wasm?url');
      kitap.prepareZXingModule({ overrides: { locateFile: (yol: string, onek: string) => (yol.endsWith('.wasm') ? wasmAdresi : onek + yol) } });
    }
    return kitap;
  })().catch((h: unknown) => { yuklenen = null; throw h; });
  return yuklenen;
}

// Eski okuyucunun (BarcodeDetector) bildiği biçimler korunur; DataMatrix ve QR asıl iş.
const OKUMA_SECENEKLERI: ReaderOptions = {
  formats: ['DataMatrix', 'QRCode', 'Code128', 'EAN13', 'EAN8', 'Code39'],
  tryHarder: true, tryRotate: true, tryInvert: true, maxNumberOfSymbols: 1,
};

/** Görüntüdeki ilk geçerli kodun metni; kod yoksa null. Motor yüklenemezse hata verir (çağıran yedeğe düşer). */
export async function matrisOku(g: Goruntu): Promise<string | null> {
  const { readBarcodes } = await yukle();
  // zxing görüntüyü yalnız data, width ve height'tan okur; colorSpace'i kullanmaz.
  const sonuc = await readBarcodes(g as ImageData, OKUMA_SECENEKLERI);
  return sonuc.find((s) => s.isValid && s.text !== '')?.text ?? null;
}
