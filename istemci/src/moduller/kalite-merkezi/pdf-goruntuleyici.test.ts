import { describe, expect, it } from 'vitest';
import { KITAPLIK_KIMLIKLERI, PDF_WASM_KIMLIGI, PDF_YERLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';
import paket from '../../../../package.json';

// Kullanıcı onayı 17.10.2026: PDF görüntüleyici depodaki pdf.js 6'ya geçer. Kitaplık ES modülüdür; uygulamanın pdfLib işlevi
// kurulan sayfadan alınır ve sahte belgeyle koşturulur: eklenen modül betiğinin metni, kitaplığın kurduğu genel adlar ve sonuna
// eklenen bitti bildirimi denetlenir.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const sayfa = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false } });

function pdfLibIslevi(): string {
  const bas = sayfa.indexOf('async function pdfLib(){');
  const son = sayfa.indexOf('\n}\n', bas);
  if (bas < 0 || son < 0) throw new Error('Sayfadan ayıklanamadı: pdfLib');
  return sayfa.slice(bas, son + 2);
}

type Lib = Record<string, unknown> & { getDocument: (o: Record<string, unknown>) => Record<string, unknown> };
interface Betik { type: string; textContent: string }

// Modül betiği eklenince "koşar": kimliğine göre genel adı kurar, sonra metnin sonundaki bildirimi yayımlar.
function kur(metinler: Record<string, string>, kurulan: Record<string, unknown>) {
  const pencere: Record<string, unknown> = {};
  const dinleyiciler = new Set<(e: { detail: string }) => void>();
  const eklenen: Betik[] = [];
  const belge = {
    getElementById: (k: string) => (k in metinler ? { textContent: metinler[k] } : null),
    createElement: (ad: string) => { expect(ad).toBe('script'); return { type: '', textContent: '' }; },
    addEventListener: (ad: string, f: (e: { detail: string }) => void) => { expect(ad).toBe('km-kitaplik'); dinleyiciler.add(f); },
    removeEventListener: (_ad: string, f: (e: { detail: string }) => void) => { dinleyiciler.delete(f); },
    dispatchEvent: (e: { type: string; detail: string }) => { for (const f of [...dinleyiciler]) f(e); },
    head: {
      appendChild: (b: Betik) => {
        eklenen.push(b);
        const kimlik = Object.keys(metinler).find((k) => b.textContent.startsWith(metinler[k] ?? '\0'));
        if (kimlik === 'lib-pdf') pencere.pdfjsLib = kurulan.lib;
        if (kimlik === 'lib-pdfw') pencere.pdfjsWorker = kurulan.calisan;
        const kuyruk = b.textContent.slice((metinler[kimlik ?? ''] ?? '').length);
        new Function('document', 'CustomEvent', kuyruk)(belge, class { type: string; constructor(tip: string, o: { detail: string }) { this.type = tip; Object.assign(this, o); } });
      },
    },
  };
  const pdfLib = new Function('document', 'window', `let PDFJS=null;${pdfLibIslevi()}; return pdfLib;`)(belge, pencere) as () => Promise<Lib>;
  return { pdfLib, eklenen, pencere };
}

describe('Kalite Merkezi PDF görüntüleyici (pdf.js 6)', () => {
  it('yer pakette bir kez geçer; kurulan sayfa eski betik yükleyicisini taşımaz', () => {
    for (const [aranan] of PDF_YERLERI) {
      expect(KM_PAKETI.split(aranan).length).toBe(2);
      expect(sayfa).not.toContain(aranan);
    }
    expect(sayfa).not.toContain('PDFJS=window.pdfjsLib;return PDFJS;');
  });

  it('kitaplık ve çalışan modül betiği olarak koşar; belge gömülü wasm fabrikasıyla açılır, ikinci çağrı yeniden yüklemez', async () => {
    const lib = { version: '6', OPS: { x: 1 }, Util: {}, getDocument: (o: Record<string, unknown>) => o };
    const { pdfLib, eklenen, pencere } = kur({ 'lib-pdf': 'export{a as getDocument}', 'lib-pdfw': 'export{b as WorkerMessageHandler}' }, { lib, calisan: { WorkerMessageHandler: {} } });
    const PDFJS = await pdfLib();
    expect(eklenen.map((b) => b.type)).toEqual(['module', 'module']);
    expect(eklenen.map((b) => b.textContent.split('\n')[0])).toEqual(['export{b as WorkerMessageHandler}', 'export{a as getDocument}']);
    expect(pencere.pdfjsWorker).toBeDefined();
    expect(PDFJS.OPS).toEqual({ x: 1 });
    expect(PDFJS.version).toBe('6');
    const secenek = PDFJS.getDocument({ data: 1, isEvalSupported: false });
    expect({ ...secenek, BinaryDataFactory: undefined }).toEqual({ data: 1, isEvalSupported: false, useWasm: true, useWorkerFetch: false, BinaryDataFactory: undefined });
    expect(typeof secenek.BinaryDataFactory).toBe('function');
    expect(await pdfLib()).toBe(PDFJS);
    expect(eklenen).toHaveLength(2);
  });

  // Borç 65-69 (19.10.2026): JPEG 2000 ve JBIG2 çözücüleri gömülü wasm'dan gelir; çerçeve dışarıdan dosya alamaz (tarayıcıda denendi).
  it('JPEG 2000 ve JBIG2 çözücüsü gömülü wasm dosyasından verilir; gömülü olmayan ya da başka türden dosya istenmez', async () => {
    const lib = { getDocument: (o: Record<string, unknown>) => o };
    const wasm = JSON.stringify({ 'openjpeg.wasm': 'AQID', 'jbig2.wasm': 'BAU=' });
    const { pdfLib } = kur({ 'lib-pdf': 'export{a as getDocument}', 'lib-pdfw': 'export{b}', 'lib-pdfwasm': wasm }, { lib, calisan: {} });
    const Fabrika = (await pdfLib()).getDocument({}).BinaryDataFactory as new () => { fetch: (o: { kind: string; filename: string }) => Promise<Uint8Array> };
    const f = new Fabrika();
    expect([...await f.fetch({ kind: 'wasmUrl', filename: 'openjpeg.wasm' })]).toEqual([1, 2, 3]);
    expect([...await f.fetch({ kind: 'wasmUrl', filename: 'jbig2.wasm' })]).toEqual([4, 5]);
    await expect(f.fetch({ kind: 'wasmUrl', filename: 'qcms_bg.wasm' })).rejects.toThrow('qcms_bg.wasm');
    await expect(f.fetch({ kind: 'cMapUrl', filename: 'openjpeg.wasm' })).rejects.toThrow();
    await expect(f.fetch({ kind: 'wasmUrl', filename: 'toString' })).rejects.toThrow();
  });

  it('kurulan sayfa çözücüleri JSON olarak taşır; verilmezse boş nesne', () => {
    const ile = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, pdfWasm: { 'openjpeg.wasm': 'AQID' }, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false } });
    expect(ile).toContain(`<script type="application/json" id="${PDF_WASM_KIMLIGI}">{"openjpeg.wasm":"AQID"}</script>`);
    expect(sayfa).toContain(`<script type="application/json" id="${PDF_WASM_KIMLIGI}">{}</script>`);
  });

  it('gömülü kitaplık yoksa hata verir', async () => {
    const { pdfLib } = kur({ 'lib-pdfw': 'x' }, { calisan: {} });
    await expect(pdfLib()).rejects.toThrow('lib');
  });

  it('pakette pdfjs-dist 6.4.299 var; kullanılmayan pdf.js 3 takma adı yok (kullanıcı onayları 17.10.2026 ve 141 a)', () => {
    const bagimliliklar = { ...paket.dependencies, ...paket.devDependencies } as Record<string, string>;
    expect(bagimliliklar['pdfjs-dist']).toBe('6.4.299');
    expect(bagimliliklar).not.toHaveProperty('pdfjs-dist-3');
  });
});
