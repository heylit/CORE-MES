// 3063 dilim 3: irsaliye sayfası ayrı çalışanda okunur; telefonda ekran donmaz. Motor ve Türkçe veri Arkon'un vendor klasöründendir
// (adresleri ana iş parçacığı kitaplik.ts ile çözüp gönderir). Çıktı: sayfanın görüntü + görünmez metin katmanlı tek sayfalık PDF'i ve metni.
// Çalışan ağa yalnız bu üç dosya için gider; okunan metin hiçbir yere gönderilmez.

import { sayfaCozunurlugu } from './irsaliye-okuma.ts';
import type { OkumaIstegi, OkumaCevabi } from './irsaliye-okuyucu.ts';

interface TessApi {
  Init(yol: null, dil: string, kip: number): number;
  SetVariable(ad: string, deger: string): boolean;
  SetImageFile(a: number, b: number): number;
  Recognize(m: null): number;
  GetUTF8Text(): string;
  Clear(): void;
}
interface TessRenderer { BeginDocument(baslik: string): boolean; AddImage(api: TessApi): boolean; EndDocument(): boolean; happy(): boolean }
interface TessModulu {
  FS: { writeFile(yol: string, veri: Uint8Array): void; readFile(yol: string): Uint8Array; unlink(yol: string): void };
  TessBaseAPI: new () => TessApi;
  TessPDFRenderer: new (cikti: string, veriKlasoru: string, yalnizMetin: boolean) => TessRenderer;
}
type TessKurucu = (a: { wasmBinary: Uint8Array; print(): void; printErr(): void }) => Promise<TessModulu>;
interface Calisan { importScripts(url: string): void; TesseractCore?: TessKurucu; onmessage: ((e: MessageEvent<OkumaIstegi>) => void) | null; postMessage(m: OkumaCevabi): void }
const ben = globalThis as unknown as Calisan;

async function ikili(adres: string, gzip: boolean): Promise<Uint8Array> {
  const r = await fetch(adres);
  if (!r.ok) throw new Error('Okuma motoru yüklenemedi');
  if (!gzip) return new Uint8Array(await r.arrayBuffer());
  const akis = (r.body ?? new Blob([]).stream()).pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

let motor: Promise<{ TM: TessModulu; api: TessApi }> | null = null;
function motoruAc(a: OkumaIstegi['adresler']): Promise<{ TM: TessModulu; api: TessApi }> {
  motor ??= (async () => {
    ben.importScripts(a.motor);
    const kurucu = ben.TesseractCore;
    if (!kurucu) throw new Error('Okuma motoru yüklenemedi');
    const TM = await kurucu({ wasmBinary: await ikili(a.wasm, false), print() {}, printErr() {} });
    TM.FS.writeFile('/tur.traineddata', await ikili(a.veri, true));
    const api = new TM.TessBaseAPI();
    if (api.Init(null, 'tur', 1) === -1) throw new Error('Türkçe okuma verisi açılamadı');
    api.SetVariable('debug_file', '/dev/null');
    return { TM, api };
  })().catch((h: unknown) => { motor = null; throw h; });
  return motor;
}

// Tek sayfa: görüntü okunur, aynı görüntüden aranabilir PDF sayfası çıkar (Tesseract'ın kendi PDF yazıcısı; Türkçe harfler için yazı tipi
// gerekmez, görünmez metin GlyphLessFont iledir).
export function sayfayiOku(TM: TessModulu, api: TessApi, jpeg: Uint8Array, en: number, boy: number): { pdf: Uint8Array; metin: string } {
  TM.FS.writeFile('/input', jpeg);
  api.SetVariable('user_defined_dpi', String(sayfaCozunurlugu(en, boy)));
  if (api.SetImageFile(1, 0) === 1) throw new Error('Sayfa okunamadı');
  const r = new TM.TessPDFRenderer('/sayfa', '/', false);
  try {
    if (!r.happy() || !r.BeginDocument('İrsaliye')) throw new Error('PDF yazılamadı');
    api.Recognize(null);
    const metin = api.GetUTF8Text();
    if (!r.AddImage(api) || !r.EndDocument()) throw new Error('PDF yazılamadı');
    const pdf = TM.FS.readFile('/sayfa.pdf').slice();
    TM.FS.unlink('/sayfa.pdf');
    return { pdf, metin };
  } finally {
    api.Clear();
  }
}

ben.onmessage = (e) => {
  const { id, jpeg, en, boy, adresler } = e.data;
  void motoruAc(adresler)
    .then(({ TM, api }) => { const s = sayfayiOku(TM, api, jpeg, en, boy); ben.postMessage({ id, ...s }); })
    .catch((h: unknown) => ben.postMessage({ id, hata: h instanceof Error ? h.message : 'Sayfa okunamadı' }));
};
