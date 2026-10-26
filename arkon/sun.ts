import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

// Derlenmiş Arkon (arkon/dist, `npm run derle:arkon`) TMI istemcisinin /arkon-mes/ yolunda sunulur (/arkon TMI sayfasıdır):
// geliştirmede ara katman olarak, derlemede istemci çıktısına kopyalanarak. Arkon TMI paketine karışmaz.
export const ARKON_YOLU = '/arkon-mes/';
const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
const ARKON_KOKU = fileURLToPath(new URL('./', import.meta.url));
const KAYNAKLAR = ['web', 'shared', 'vite.config.ts'].map((k) => join(ARKON_KOKU, k));

const TURLER: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip',
};

// Yol dist dışına çıkamaz; çıkarsa null.
export function dosyaYolu(istekYolu: string, kok = DIST): string | null {
  const goreli = decodeURIComponent(istekYolu.split('?')[0] ?? '').replace(/^\/+/, '');
  const tam = normalize(join(kok, goreli === '' ? 'index.html' : goreli));
  return tam.startsWith(kok) || `${tam}${sep}` === kok ? tam : null;
}

// İçerik güvenliği ilkesi (#199, kullanıcı kararı CSP a): zorlayıcı başlık; ikinci tarayıcı turunda yalnız-rapor kipinde ihlal sıfırdı.
// frame-ancestors <meta> ile verilemez, bu yüzden derlemede değil burada, sayfa cevabının başlığındadır. Satır içi betikler (TMI köprüsü
// çağrısı ve ARKON_FILES) özetle izinlidir; özet sunulan sayfadan hesaplanır, Arkon yeniden derlenince kendiliğinden güncellenir.
// Tarayıcı özeti, HTML ayrıştırıcının satır sonlarını LF'ye çevirdiği metinden alır; Windows'ta (git autocrlf) sayfa CRLF ile gelir, özet de LF'den hesaplanır.
// Gerekçeler: wasm-unsafe-eval OCCT ve Tesseract ikilisini bellekten derlemek için; unsafe-inline stil, ekranın ve çizim svg'sinin style
// özniteliği ile rapor sayfasının <style>'ı için; blob: PDF sayfası resmi için.
export const ILKE_BASLIGI = 'Content-Security-Policy';
const SATIR_ICI_BETIK = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;

export function icerikIlkesi(sayfa: string): string {
  const ozetler = [...sayfa.matchAll(SATIR_ICI_BETIK)]
    .map((e) => `'sha256-${createHash('sha256').update((e[1] ?? '').replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`);
  return [
    "default-src 'self'",
    ["script-src 'self'", ...ozetler, "'wasm-unsafe-eval'"].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

// STEP okuyucu çalışanı (#199 TBw): occt-import-js'in bağlama kodu Function yapıcısı kullanır, `unsafe-eval` yalnız bu cevabın kendi zorlayıcı
// ilkesindedir. URL ile yüklenen çalışan yaratanın ilkesini değil kendi cevabının ilkesini kullanır (Chrome 97 ve sonrası); ana sayfa ilkesi değişmez.
// Başka hiçbir dosya bu ilkeyi almaz. Çalışan ağa çıkmaz (wasm ikilisi mesajla gelir); yalnız aynı klasördeki okuyucuyu yükler.
export const CALISAN_YOLU = 'vendor/occt/step-calisan.js';
export const CALISAN_ILKE_BASLIGI = 'Content-Security-Policy';
export const CALISAN_ILKESI = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'";
// PDF okuyucu çalışanı (kart #731): URL ile yüklenince kendi cevabının ilkesini kullanır; başlıksız gelirse hiç ilkesi olmaz. Ağa çıkmaz
// (belge baytı mesajla gelir), eval istemez: en dar ilke.
export const PDF_CALISAN_YOLU = 'vendor/pdfjs/pdf.worker.min.js';
export const PDF_CALISAN_ILKESI = "default-src 'none'; script-src 'self'";

// Kaynaktaki en yeni dosya derlenmiş sayfadan yeniyse (ya da sayfa yoksa) derleme eskidir. Depo güncellenip `derle:arkon` unutulunca
// bu dosyanın yeni ilkesi eski Arkon'a uygulanıyordu: eski derlemede STEP okuyucu ana sayfada koşar, zorlayıcı ilke onu durdurur, 3B açılmaz.
export async function derlemeEskiMi(kok: string, kaynaklar: readonly string[]): Promise<boolean> {
  const sayfa = await stat(join(kok, 'index.html')).catch(() => null);
  if (sayfa === null) return true;
  for (const kaynak of kaynaklar) {
    const bilgi = await stat(kaynak).catch(() => null);
    if (bilgi === null) continue;
    const yollar = bilgi.isDirectory() ? (await readdir(kaynak, { recursive: true })).map((y) => join(kaynak, y)) : [kaynak];
    // Klasörün zamanı dosya eklenip silinince değişir, içerik değişince değişmez: yalnız dosyalar sayılır.
    for (const yol of yollar) {
      const dosya = await stat(yol).catch(() => null);
      if (dosya?.isFile() === true && dosya.mtimeMs > sayfa.mtimeMs) return true;
    }
  }
  return false;
}

// Geliştirme sunucusu NODE_ENV'i development yapar; Vite derlemede var olan değeri korur, React geliştirme paketi girerdi.
async function arkonuDerle(): Promise<void> {
  const { build } = await import('vite');
  const onceki = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    await build({ configFile: join(ARKON_KOKU, 'vite.config.ts'), mode: 'production', logLevel: 'warn' });
  } finally {
    if (onceki === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = onceki;
  }
}

// Adında içerik özeti taşıyan derleme çıktısı (assets/index-BMCPWWXW.js) değişmez: yeni derleme yeni ad üretir. Tarayıcı bunları
// bir yıl sorgusuz tutar; Üretim Terminali her açılışta 700 KB'lık betiği yeniden indirmez. Özetsiz dosyalar (sayfa, vendor) her
// açılışta yalnız ETag ile sorulur, değişmediyse 304 döner.
const OZETLI = /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
export const KALICI_ONBELLEK = 'public, max-age=31536000, immutable';
export const SORARAK_ONBELLEK = 'no-cache';

// Metin ve wasm gzip ile gider (wasm ve betikler üçte bire iner); .gz ve yazı tipi zaten sıkışıktır.
const SIKISAN = new Set(['.html', '.js', '.css', '.wasm']);
const EN_AZ_SIKISTIRMA = 1024;
const gzipla = promisify(gzip);

type Basliklar = Record<string, string | string[] | undefined>;
const baslik = (b: Basliklar | undefined, ad: string): string => {
  const d = b?.[ad];
  return Array.isArray(d) ? d.join(',') : d ?? '';
};
// "gzip;q=0" reddetmektir.
const gzipKabulMu = (b: Basliklar | undefined): boolean => baslik(b, 'accept-encoding').split(',').some((parca) => {
  const [ad = '', ...ekler] = parca.split(';');
  return ad.trim().toLowerCase() === 'gzip' && !ekler.some((e) => /^\s*q=0(\.0*)?\s*$/i.test(e));
});

// Sunulan her Arkon dosyası buradan geçer: sayfa içerik ilkesiyle, STEP çalışanı kendi ilkesiyle. guncelle yalnız sayfa isteğinde çağrılır.
function araKatman(kok: string, guncelle: () => Promise<void>) {
  // Sıkıştırılmış kopya dosyanın boyu ve zamanıyla tutulur; dosya değişince yeniden sıkıştırılır.
  const sikisik = new Map<string, { etiket: string; govde: Promise<Buffer> }>();
  return (
    istek: { url?: string; headers?: Basliklar },
    yanit: { statusCode: number; setHeader(ad: string, deger: string): unknown; end(govde?: unknown): unknown },
    sonraki: (hata?: unknown) => void,
  ): void => {
    void (async () => {
      const yol = dosyaYolu(istek.url ?? '', kok);
      if (yol !== null && extname(yol) === '.html') await guncelle();
      const bilgi = yol === null ? null : await stat(yol).catch(() => null);
      if (yol === null || bilgi === null || !bilgi.isFile()) {
        yanit.statusCode = 404;
        yanit.setHeader('Content-Type', 'text/plain; charset=utf-8');
        yanit.end('Arkon derlenmemiş: npm run derle:arkon');
        return;
      }
      const goreli = yol.slice(kok.length).split(sep).join('/');
      const sikistir = SIKISAN.has(extname(yol)) && bilgi.size >= EN_AZ_SIKISTIRMA && gzipKabulMu(istek.headers);
      const etiket = `W/"${bilgi.size.toString(36)}-${Math.trunc(bilgi.mtimeMs).toString(36)}${sikistir ? '-gz' : ''}"`;
      yanit.setHeader('Content-Type', TURLER[extname(yol)] ?? 'application/octet-stream');
      yanit.setHeader('Cache-Control', OZETLI.test(goreli) ? KALICI_ONBELLEK : SORARAK_ONBELLEK);
      yanit.setHeader('ETag', etiket);
      if (SIKISAN.has(extname(yol))) yanit.setHeader('Vary', 'Accept-Encoding');
      const sayfa = extname(yol) === '.html' ? await readFile(yol) : null;
      if (sayfa !== null) yanit.setHeader(ILKE_BASLIGI, icerikIlkesi(sayfa.toString('utf8')));
      if (yol === join(kok, CALISAN_YOLU)) yanit.setHeader(CALISAN_ILKE_BASLIGI, CALISAN_ILKESI);
      if (yol === join(kok, PDF_CALISAN_YOLU)) yanit.setHeader(CALISAN_ILKE_BASLIGI, PDF_CALISAN_ILKESI);
      if (baslik(istek.headers, 'if-none-match').split(',').some((e) => e.trim() === etiket)) {
        yanit.statusCode = 304;
        yanit.end();
        return;
      }
      if (!sikistir) {
        yanit.end(sayfa ?? await readFile(yol));
        return;
      }
      let kayit = sikisik.get(yol);
      if (kayit?.etiket !== etiket) {
        kayit = { etiket, govde: (sayfa !== null ? Promise.resolve(sayfa) : readFile(yol)).then((ham) => gzipla(ham)) };
        sikisik.set(yol, kayit);
        kayit.govde.catch(() => { if (sikisik.get(yol) === kayit) sikisik.delete(yol); });
      }
      const govde = await kayit.govde;
      yanit.setHeader('Content-Encoding', 'gzip');
      yanit.setHeader('Content-Length', String(govde.length));
      yanit.end(govde);
    })().catch(sonraki);
  };
}

// kok: sunulan Arkon çıktısı (sınamada geçici klasör); sonu ayırıcıyla biter. derle: eski derlemeyi yeniler (yalnız gerçek çıktıda; sınamada
// verilir ya da yoktur). Geliştirme sunucusu sayfa her istendiğinde derlemeyi denetler, eskiyse önce derler, sonra sunar.
export function arkonuSun(kok = DIST, derle: { kaynaklar: readonly string[]; calistir: () => Promise<void> } | null =
  kok === DIST ? { kaynaklar: KAYNAKLAR, calistir: arkonuDerle } : null): Plugin {
  let istemciCiktisi: string | null = null;
  return {
    name: 'arkon-sun',
    // Yalnız gerçek derlemede kopyalanır; test koşucusu da paketi kapatır ama çıktı klasörü sahtedir.
    configResolved(ayar) {
      istemciCiktisi = ayar.command === 'build' && !ayar.mode.startsWith('test') && process.env['VITEST'] === undefined
        ? join(ayar.root, ayar.build.outDir)
        : null;
    },
    configureServer(sunucu) {
      let derleniyor: Promise<void> | null = null;
      const guncelle = async (): Promise<void> => {
        if (derle === null || !(await derlemeEskiMi(kok, derle.kaynaklar))) return;
        derleniyor ??= (async () => {
          sunucu.config.logger.info('Arkon kaynağı derlemeden yeni: arkon/dist yeniden derleniyor.');
          await derle.calistir();
        })().finally(() => { derleniyor = null; });
        await derleniyor;
      };
      sunucu.middlewares.use(ARKON_YOLU, araKatman(kok, guncelle));
    },
    // Derlenmiş istemcinin önizlemesi (`vite preview`): Arkon istemci çıktısına kopyalanmıştır, oradan aynı başlıklarla sunulur; derleme denetimi yok.
    configurePreviewServer(sunucu) {
      const onizlemeKoku = kok === DIST ? `${join(sunucu.config.root, sunucu.config.build.outDir, ARKON_YOLU.replaceAll('/', ''))}${sep}` : kok;
      sunucu.middlewares.use(ARKON_YOLU, araKatman(onizlemeKoku, async () => {}));
    },
    async closeBundle() {
      if (istemciCiktisi === null) return;
      await cp(DIST, join(istemciCiktisi, ARKON_YOLU.replaceAll('/', '')), { recursive: true });
    },
  };
}
