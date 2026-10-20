/* Tarayıcıda çalışma anında yüklenen kütüphaneler ve uygulama köprüleri */
import type { AKStore as AKStoreT } from './data/store';
declare global {
  interface Window {
    AKStore: typeof AKStoreT;
    AKTol: any;
    AKStep: any;
    /** Android kabuğu (WebView) köprüsü */
    ArkonAndroid?: { save(name: string, b64: string, mime: string): void; print?(name: string): void; platform?(): string };
    /** gömülü / yerel kütüphane yolları (index.html) */
    ARKON_FILES: Record<string, { path: string; preload?: boolean; gz?: boolean }>;
    THREE: any; occtimportjs: any; jsQR: any; qrcode: any; TesseractCore: any;
    __arkonPerf: [string, number][];
    __akSay: any; __arkonTest: any;
    claude: any;
    webkitAudioContext: typeof AudioContext;
    showDirectoryPicker?: (opt?: any) => Promise<any>;
  }
  // FileSystem Access API (Chrome / Edge)
  var FileSystemHandle: any;
  // Vite
  interface ImportMeta { readonly env: Record<string, string> }
}
export {};
