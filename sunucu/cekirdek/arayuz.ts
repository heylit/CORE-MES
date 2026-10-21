import { createServer as httpSunucusu, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as httpsSunucusu } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { ARKON_YOLU, CALISAN_ILKESI, CALISAN_YOLU, KALICI_ONBELLEK, SORARAK_ONBELLEK, icerikIlkesi } from '../../arkon/sun.ts';
import { EK_GUVENLIK_BASLIKLARI, ICERIK_ILKESI, ILKE_BASLIGI } from '../../istemci/src/ortak/pwa/icerik-ilkesi.ts';
import type { HttpsAyari } from '../../istemci/src/ortak/pwa/https.ts';

// Derlenmiş istemci (istemci/dist) telefonların ve ters vekilin bağlandığı kapıdan (4101) sunucu sürecinin kendisince verilir;
// eskiden bunu ayrı bir `vite preview` süreci yapıyordu (teslim planı E-19). /api aynı kapıdan uygulamaya gider: ara vekil
// kalmadığı için istemcinin adresi ve HTTPS doğrudan bağlantıdan bilinir. Arkon çıktısı istemci çıktısına kopyalanmıştır
// (arkon/sun.ts closeBundle) ve kendi içerik ilkeleriyle gider.
export const ARAYUZ_PORTU_DEGISKENI = 'TMIV2_ARAYUZ_PORT';
export const VARSAYILAN_ARAYUZ_PORTU = 4101;

export function arayuzPortuOku(env: Record<string, string | undefined>, apiPortu: number): number {
  const deger = env[ARAYUZ_PORTU_DEGISKENI]?.trim() ?? '';
  if (deger === '') return VARSAYILAN_ARAYUZ_PORTU;
  const sayi = Number(deger);
  if (!/^\d+$/.test(deger) || sayi < 1 || sayi > 65535) {
    throw new Error(`Ortam değişkeni geçersiz: ${ARAYUZ_PORTU_DEGISKENI} (1-65535 arası tam sayı olmalı)`);
  }
  if (sayi === apiPortu) throw new Error(`Ortam değişkeni geçersiz: ${ARAYUZ_PORTU_DEGISKENI} (TMIV2_PORT ile aynı olamaz)`);
  return sayi;
}

const TURLER: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.gz': 'application/gzip',
  '.traineddata': 'application/octet-stream',
};

// Adında içerik özeti olan derleme çıktısı değişmez (yeni derleme yeni ad üretir); öteki her şey her açılışta ETag ile sorulur.
const OZETLI = /(^|\/)assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
const SIKISAN = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.wasm', '.txt']);
const EN_AZ_SIKISTIRMA = 1024;
const gzipla = promisify(gzip);
const ARKON_KLASORU = ARKON_YOLU.replaceAll('/', '');

type ApiIsleyicisi = (istek: IncomingMessage, yanit: ServerResponse) => void;

const baslik = (istek: IncomingMessage, ad: string): string => {
  const d = istek.headers[ad];
  return Array.isArray(d) ? d.join(',') : d ?? '';
};
// "gzip;q=0" reddetmektir.
const gzipKabulMu = (istek: IncomingMessage): boolean => baslik(istek, 'accept-encoding').split(',').some((parca) => {
  const [ad = '', ...ekler] = parca.split(';');
  return ad.trim().toLowerCase() === 'gzip' && !ekler.some((e) => /^\s*q=0(\.0*)?\s*$/i.test(e));
});

function duzMetin(yanit: ServerResponse, durum: number, metin: string): void {
  yanit.statusCode = durum;
  yanit.setHeader('Content-Type', 'text/plain; charset=utf-8');
  yanit.end(metin);
}

async function dosyaMi(yol: string): Promise<boolean> {
  return (await stat(yol).catch(() => null))?.isFile() === true;
}

// Kökün içinde kalan yol ya da null; kodu bozuk ya da NUL taşıyan yol hatadır.
function kokteYol(kok: string, yol: string): string | null {
  const tam = normalize(join(kok, yol));
  return tam === kok.slice(0, -1) || tam.startsWith(kok) ? tam : null;
}

export function arayuzIsleyicisi({ kok, api }: { kok: string; api: ApiIsleyicisi }): ApiIsleyicisi {
  const istemciKoku = `${resolve(kok)}${sep}`;
  const arkonKoku = `${join(istemciKoku, ARKON_KLASORU)}${sep}`;
  const sikisik = new Map<string, { etiket: string; govde: Promise<Buffer> }>();

  const sun = async (istek: IncomingMessage, yanit: ServerResponse): Promise<void> => {
    const hamYol = (istek.url ?? '/').split('?')[0] ?? '/';
    if (hamYol === '/api' || hamYol.startsWith('/api/')) {
      api(istek, yanit);
      return;
    }
    if (istek.method !== 'GET' && istek.method !== 'HEAD') {
      yanit.setHeader('Allow', 'GET, HEAD');
      duzMetin(yanit, 405, 'Yalnız okuma isteği.');
      return;
    }
    let yol: string;
    try {
      yol = decodeURIComponent(hamYol);
    } catch {
      duzMetin(yanit, 400, 'Adres bozuk.');
      return;
    }
    if (yol.includes('\0')) {
      duzMetin(yanit, 400, 'Adres bozuk.');
      return;
    }

    const arkon = yol === ARKON_YOLU.slice(0, -1) || yol.startsWith(ARKON_YOLU);
    const kokYolu = arkon ? arkonKoku : istemciKoku;
    const goreli = (arkon ? yol.slice(ARKON_YOLU.length - 1) : yol).replace(/^\/+/, '');
    let dosya = kokteYol(kokYolu, goreli === '' ? 'index.html' : goreli);
    if (dosya !== null && (await stat(dosya).catch(() => null))?.isDirectory() === true) dosya = join(dosya, 'index.html');
    if (dosya === null || !(await dosyaMi(dosya))) {
      // Ekran adresleri (uzantısız) uygulamanın sayfasıdır; uzantılı ya da Arkon altındaki eksik dosya gerçekten yoktur.
      if (arkon) {
        duzMetin(yanit, 404, 'Arkon derlenmemiş ya da dosya yok: npm run derle:istemci');
        return;
      }
      if (dosya === null || extname(goreli) !== '') {
        duzMetin(yanit, 404, 'Dosya bulunamadı.');
        return;
      }
      dosya = join(istemciKoku, 'index.html');
      if (!(await dosyaMi(dosya))) {
        duzMetin(yanit, 503, 'Arayüz derlenmemiş: npm run derle:istemci');
        return;
      }
    }

    const bilgi = await stat(dosya);
    const uzanti = extname(dosya);
    const kokGoreli = dosya.slice(istemciKoku.length).split(sep).join('/');
    const sikistir = SIKISAN.has(uzanti) && bilgi.size >= EN_AZ_SIKISTIRMA && gzipKabulMu(istek);
    const etiket = `W/"${bilgi.size.toString(36)}-${Math.trunc(bilgi.mtimeMs).toString(36)}${sikistir ? '-gz' : ''}"`;
    yanit.setHeader('Content-Type', TURLER[uzanti] ?? 'application/octet-stream');
    yanit.setHeader('Cache-Control', OZETLI.test(kokGoreli) ? KALICI_ONBELLEK : SORARAK_ONBELLEK);
    yanit.setHeader('ETag', etiket);
    yanit.setHeader('X-Content-Type-Options', 'nosniff');
    for (const [ad, deger] of Object.entries(EK_GUVENLIK_BASLIKLARI)) yanit.setHeader(ad, deger);
    if (SIKISAN.has(uzanti)) yanit.setHeader('Vary', 'Accept-Encoding');
    const sayfa = uzanti === '.html' ? await readFile(dosya) : null;
    let ilke = ICERIK_ILKESI;
    if (arkon && sayfa !== null) ilke = icerikIlkesi(sayfa.toString('utf8'));
    if (arkon && dosya === join(arkonKoku, CALISAN_YOLU)) ilke = CALISAN_ILKESI;
    yanit.setHeader(ILKE_BASLIGI, ilke);

    if (baslik(istek, 'if-none-match').split(',').some((e) => e.trim() === etiket)) {
      yanit.statusCode = 304;
      yanit.end();
      return;
    }
    let govde: Buffer;
    if (sikistir) {
      let kayit = sikisik.get(dosya);
      if (kayit?.etiket !== etiket) {
        const kaynak = dosya;
        kayit = { etiket, govde: (sayfa !== null ? Promise.resolve(sayfa) : readFile(kaynak)).then((ham) => gzipla(ham)) };
        const yeni = kayit;
        sikisik.set(kaynak, yeni);
        yeni.govde.catch(() => { if (sikisik.get(kaynak) === yeni) sikisik.delete(kaynak); });
      }
      govde = await kayit.govde;
      yanit.setHeader('Content-Encoding', 'gzip');
    } else {
      govde = sayfa ?? await readFile(dosya);
    }
    yanit.setHeader('Content-Length', String(govde.length));
    yanit.end(istek.method === 'HEAD' ? undefined : govde);
  };

  return (istek, yanit) => {
    sun(istek, yanit).catch(() => {
      if (yanit.headersSent) { yanit.destroy(); return; }
      duzMetin(yanit, 500, 'Dosya okunamadı.');
    });
  };
}

export interface ArayuzKapisi { kapat(): Promise<void> }

// Uygulama hazır olmalı (listen ya da ready sonrası): /api istekleri onun yönlendiricisine verilir.
export async function arayuzKapisiAc(s: { kok: string; api: ApiIsleyicisi; port: number; host: string; https: HttpsAyari | null }): Promise<ArayuzKapisi> {
  const isle = arayuzIsleyicisi({ kok: s.kok, api: s.api });
  const sunucu: Server = s.https === null ? httpSunucusu(isle) : httpsSunucusu(s.https, isle);
  await new Promise<void>((coz, red) => {
    sunucu.once('error', red);
    sunucu.listen(s.port, s.host, () => { sunucu.off('error', red); coz(); });
  });
  return {
    kapat: () => new Promise<void>((coz) => {
      sunucu.close(() => { coz(); });
      sunucu.closeAllConnections();
    }),
  };
}
