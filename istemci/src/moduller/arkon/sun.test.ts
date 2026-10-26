// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CALISAN_ILKESI, CALISAN_YOLU, ILKE_BASLIGI, PDF_CALISAN_ILKESI, PDF_CALISAN_YOLU, KALICI_ONBELLEK, SORARAK_ONBELLEK, arkonuSun, derlemeEskiMi, icerikIlkesi,
} from '../../../../arkon/sun.ts';

const KOPRU = 'try { for (var w = window; w.parent && w.parent !== w;) { w = w.parent; if (w.__tmiArkonBagla) { w.__tmiArkonBagla(window); break; } } } catch (e) {}';
const DOSYALAR = 'window.ARKON_FILES = { "pdfjs": { "path": "vendor/pdfjs/pdf.min.js" } };';
const SAYFA = `<!doctype html><html><head><script type="module" crossorigin src="./assets/index-x.js"></script></head>`
  + `<body><div id="root"></div><script>${KOPRU}</script>\n<script>\n${DOSYALAR}\n</script></body></html>`;
const ozet = (metin: string): string => `'sha256-${createHash('sha256').update(metin, 'utf8').digest('base64')}'`;

type Isleyici = (istek: { url: string }, yanit: Yanit, sonraki: (h?: unknown) => void) => void;
interface Yanit { statusCode: number; basliklar: Record<string, string>; setHeader(ad: string, deger: string): void; end(govde?: unknown): void; bitti: Promise<void> }

function yanitKur(): Yanit {
  let coz = (): void => {};
  const y: Yanit = {
    statusCode: 200, basliklar: {}, bitti: new Promise<void>((c) => { coz = c; }),
    setHeader(ad, deger) { y.basliklar[ad.toLowerCase()] = deger; },
    end() { coz(); },
  };
  return y;
}

describe('Arkon sayfası içerik güvenliği ilkesi (zorlayıcı kip, CSP a)', () => {
  let kok = '';
  let isleyici: Isleyici;

  beforeAll(async () => {
    kok = `${await mkdtemp(join(tmpdir(), 'arkon-sun-'))}${sep}`;
    await writeFile(join(kok, 'index.html'), SAYFA);
    await mkdir(join(kok, 'vendor'));
    await writeFile(join(kok, 'vendor', 'a.js'), 'var a = 1;');
    await mkdir(join(kok, 'vendor', 'occt'));
    await writeFile(join(kok, 'vendor', 'occt', 'occt-import-js.js'), 'var b = 1;');
    await writeFile(join(kok, CALISAN_YOLU), 'var c = 1;');
    await mkdir(join(kok, 'vendor', 'pdfjs'));
    await writeFile(join(kok, PDF_CALISAN_YOLU), 'var d = 1;');
    await writeFile(join(kok, 'vendor', 'pdfjs', 'pdf.min.js'), 'var e = 1;');
    const eklenti = arkonuSun(kok) as unknown as { configureServer(s: unknown): void };
    eklenti.configureServer({ middlewares: { use: (_yol: string, i: Isleyici) => { isleyici = i; } } });
  });
  afterAll(async () => { await rm(kok, { recursive: true, force: true }); });

  const iste = async (url: string): Promise<Yanit> => {
    const y = yanitKur();
    isleyici({ url }, y, (h) => { throw h; });
    await y.bitti;
    return y;
  };

  it('sayfa cevabı zorlayıcı başlığı taşır; satır içi iki betik özetle izinli; yalnız-rapor başlığı yok', async () => {
    const y = await iste('/');
    const ilke = y.basliklar[ILKE_BASLIGI.toLowerCase()] ?? '';
    expect(ILKE_BASLIGI).toBe('Content-Security-Policy');
    expect(y.basliklar['content-security-policy-report-only']).toBeUndefined();
    expect(ilke).toContain(`script-src 'self' ${ozet(KOPRU)} ${ozet(`\n${DOSYALAR}\n`)} 'wasm-unsafe-eval'`);
    for (const y2 of ["object-src 'none'", "frame-ancestors 'self'", "img-src 'self' blob: data:", "style-src 'self' 'unsafe-inline'"]) expect(ilke).toContain(y2);
    expect(ilke).not.toMatch(/report-uri|report-to| 'unsafe-eval'|https?:/);
  });

  it('özet sayfadan hesaplanır: betik değişince eski özet ilkede kalmaz; src\'li betik ve kütüphane dosyası özetlenmez', async () => {
    const degisik = icerikIlkesi(SAYFA.replace(KOPRU, `${KOPRU} alert(1);`));
    expect(degisik).not.toContain(ozet(KOPRU));
    expect(degisik.match(/'sha256-/g)).toHaveLength(2);
    expect(icerikIlkesi('<script src="x.js"></script>')).toContain("script-src 'self' 'wasm-unsafe-eval'");
    const kutuphane = await iste('/vendor/a.js');
    expect(kutuphane.basliklar[ILKE_BASLIGI.toLowerCase()]).toBeUndefined();
    expect((await iste('/../disari.html')).statusCode).toBe(404);
  });

  it('CRLF sayfa (Windows, git autocrlf) LF sayfayla aynı özeti alır: tarayıcı satır sonlarını LF\'ye çevirip özetler', () => {
    const crlf = icerikIlkesi(SAYFA.replace(/\n/g, '\r\n'));
    expect(crlf).toBe(icerikIlkesi(SAYFA));
    expect(crlf).toContain(ozet(`\n${DOSYALAR}\n`));
  });

  it('STEP okuyucu çalışanı (TBw) kendi zorlayıcı ilkesini taşır, unsafe-eval yalnız orada; ana sayfa ve başka kütüphane dosyası bu izni almaz', async () => {
    const calisan = await iste(`/${CALISAN_YOLU}`);
    const ilke = calisan.basliklar['content-security-policy'] ?? '';
    expect(ilke).toBe(CALISAN_ILKESI);
    expect(ilke).toMatch(/^default-src 'none'; /);
    expect(ilke).toContain("'unsafe-eval'");
    expect(calisan.basliklar['content-security-policy-report-only']).toBeUndefined();
    expect((await iste(`/${CALISAN_YOLU}?v=2`)).basliklar['content-security-policy']).toBe(CALISAN_ILKESI);
    // Ret: aynı klasördeki okuyucu, başka kütüphane ve sayfa unsafe-eval almaz.
    for (const yol of ['/vendor/occt/occt-import-js.js', '/vendor/a.js']) {
      const y = await iste(yol);
      expect(y.basliklar['content-security-policy']).toBeUndefined();
    }
    const sayfa = await iste('/');
    expect(sayfa.basliklar['content-security-policy']).toBeDefined();
    expect(sayfa.basliklar['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(sayfa.basliklar['content-security-policy']).not.toBe(CALISAN_ILKESI);
  });

  it('PDF okuyucu çalışanı en dar ilkeyi taşır (ağ yok, eval yok); pdf.js kitaplığının kendisi ilke almaz', async () => {
    expect(PDF_CALISAN_ILKESI).toBe("default-src 'none'; script-src 'self'");
    expect((await iste(`/${PDF_CALISAN_YOLU}`)).basliklar['content-security-policy']).toBe(PDF_CALISAN_ILKESI);
    expect((await iste(`/${PDF_CALISAN_YOLU}?v=3`)).basliklar['content-security-policy']).toBe(PDF_CALISAN_ILKESI);
    expect((await iste('/vendor/pdfjs/pdf.min.js')).basliklar['content-security-policy']).toBeUndefined();
  });
});

describe('eski Arkon derlemesi (3B açılmıyor: yeni ilke eski derlemeyi durduruyordu)', () => {
  let kok = '';
  let kaynak = '';
  const zaman = (s: number): Date => new Date(Date.UTC(2026, 9, 10, 12, 0, s));

  beforeAll(async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'arkon-eski-'));
    kok = `${join(tmp, 'dist')}${sep}`;
    kaynak = join(tmp, 'web');
    await mkdir(join(kaynak, 'src', 'app'), { recursive: true });
    await mkdir(kok);
  });
  afterAll(async () => { await rm(join(kok, '..'), { recursive: true, force: true }); });

  const kur = async (sayfaSn: number | null, kaynakSn: number): Promise<void> => {
    await rm(join(kok, 'index.html'), { force: true });
    if (sayfaSn !== null) { await writeFile(join(kok, 'index.html'), SAYFA); await utimes(join(kok, 'index.html'), zaman(sayfaSn), zaman(sayfaSn)); }
    await writeFile(join(kaynak, 'src', 'app', 'model-3b.ts'), 'x');
    await utimes(join(kaynak, 'src', 'app', 'model-3b.ts'), zaman(kaynakSn), zaman(kaynakSn));
  };

  it('kaynak derlenmiş sayfadan yeniyse ya da sayfa yoksa eskidir', async () => {
    await kur(10, 5);
    expect(await derlemeEskiMi(kok, [kaynak])).toBe(false);
    await kur(10, 20);
    expect(await derlemeEskiMi(kok, [kaynak])).toBe(true);
    await kur(null, 5);
    expect(await derlemeEskiMi(kok, [kaynak])).toBe(true);
  });

  it('sayfa istenince eski derleme önce yenilenir; güncel derlemede ve sayfa dışı dosyada derlenmez', async () => {
    let derlenen = 0;
    const eklenti = arkonuSun(kok, { kaynaklar: [kaynak], calistir: async () => { derlenen += 1; await utimes(join(kok, 'index.html'), zaman(30), zaman(30)); } }) as unknown as { configureServer(s: unknown): void };
    let isleyici: Isleyici = () => {};
    eklenti.configureServer({ config: { logger: { info: () => {} } }, middlewares: { use: (_yol: string, i: Isleyici) => { isleyici = i; } } });
    const iste = async (url: string): Promise<Yanit> => { const y = yanitKur(); isleyici({ url }, y, (h) => { throw h; }); await y.bitti; return y; };
    await kur(10, 20);
    await writeFile(join(kok, 'a.js'), 'var a = 1;');
    await iste('/a.js');
    expect(derlenen).toBe(0);
    expect((await iste('/')).statusCode).toBe(200);
    expect(derlenen).toBe(1);
    await iste('/');
    expect(derlenen).toBe(1);
  });
});

describe('Derlenmiş istemci önizlemesi (vite preview, kart #786)', () => {
  let kok = '';
  let kaynak = '';
  afterAll(async () => { await rm(kok, { recursive: true, force: true }); await rm(kaynak, { recursive: true, force: true }); });

  it('/arkon-mes/ sayfası ve STEP çalışanı aynı ilkelerle sunulur; kaynak yeni olsa da önizleme derleme yapmaz', async () => {
    kok = `${await mkdtemp(join(tmpdir(), 'arkon-onizle-'))}${sep}`;
    await writeFile(join(kok, 'index.html'), SAYFA);
    await mkdir(join(kok, 'vendor', 'occt'), { recursive: true });
    await writeFile(join(kok, CALISAN_YOLU), 'var c = 1;');
    kaynak = await mkdtemp(join(tmpdir(), 'arkon-kaynak-'));
    await writeFile(join(kaynak, 'yeni.ts'), 'x');
    await utimes(join(kok, 'index.html'), new Date(0), new Date(0));
    let derlendi = 0;
    let isleyici: Isleyici | null = null;
    const eklenti = arkonuSun(kok, { kaynaklar: [kaynak], calistir: async () => { derlendi++; } }) as unknown as { configurePreviewServer(s: unknown): void };
    eklenti.configurePreviewServer({ middlewares: { use: (yol: string, i: Isleyici) => { expect(yol).toBe('/arkon-mes/'); isleyici = i; } } });
    const iste = async (url: string): Promise<Yanit> => {
      const y = yanitKur();
      (isleyici as unknown as Isleyici)({ url }, y, (h) => { throw h; });
      await y.bitti;
      return y;
    };
    expect((await iste('/')).basliklar['content-security-policy']).toContain(ozet(KOPRU));
    expect((await iste(`/${CALISAN_YOLU}`)).basliklar['content-security-policy']).toBe(CALISAN_ILKESI);
    expect(derlendi).toBe(0);
  });
});

describe('Arkon dosyaları önbellek ve sıkıştırmayla sunulur (Üretim Terminali her açılışta 700 KB indirmesin)', () => {
  let kok = '';
  let isleyici: Isleyici;
  const BETIK = `var arkon = "${'x'.repeat(4000)}";`;

  beforeAll(async () => {
    kok = `${await mkdtemp(join(tmpdir(), 'arkon-onbellek-'))}${sep}`;
    await writeFile(join(kok, 'index.html'), SAYFA + ' '.repeat(2000));
    await mkdir(join(kok, 'assets'));
    await writeFile(join(kok, 'assets', 'index-BMCPWWXW.js'), BETIK);
    await writeFile(join(kok, 'assets', 'yazi-DY7AcnAa.woff2'), 'w'.repeat(4000));
    await mkdir(join(kok, 'vendor'));
    await writeFile(join(kok, 'vendor', 'kutuphane.js'), BETIK);
    await writeFile(join(kok, 'vendor', 'kucuk.js'), 'var k = 1;');
    await writeFile(join(kok, 'vendor', 'veri.gz'), 'g'.repeat(4000));
    const eklenti = arkonuSun(kok) as unknown as { configurePreviewServer(s: unknown): void };
    eklenti.configurePreviewServer({ middlewares: { use: (_yol: string, i: Isleyici) => { isleyici = i; } } });
  });
  afterAll(async () => { await rm(kok, { recursive: true, force: true }); });

  const iste = async (url: string, headers: Record<string, string> = {}): Promise<Yanit & { govde: Buffer | undefined }> => {
    let govde: Buffer | undefined;
    const y = yanitKur();
    const bitir = y.end.bind(y);
    y.end = (g?: unknown) => { govde = g === undefined ? undefined : Buffer.from(g as Buffer); bitir(); };
    (isleyici as unknown as (i: unknown, y: Yanit, s: (h?: unknown) => void) => void)({ url, headers }, y, (h) => { throw h; });
    await y.bitti;
    return Object.assign(y, { govde });
  };

  it('özet adlı derleme çıktısı kalıcı önbelleğe, sayfa ve vendor dosyaları sorarak önbelleğe girer', async () => {
    expect((await iste('/assets/index-BMCPWWXW.js')).basliklar['cache-control']).toBe(KALICI_ONBELLEK);
    expect((await iste('/assets/yazi-DY7AcnAa.woff2')).basliklar['cache-control']).toBe(KALICI_ONBELLEK);
    // Ret: özetsiz dosya kalıcı önbelleğe girmez, yoksa Arkon güncellenince eski kopya kalırdı.
    for (const yol of ['/', '/index.html', '/vendor/kutuphane.js']) {
      const y = await iste(yol);
      expect(y.basliklar['cache-control']).toBe(SORARAK_ONBELLEK);
      expect(y.basliklar['etag']).toMatch(/^W\/"/);
    }
  });

  it('gzip kabul eden tarayıcıya betik, stil ve sayfa sıkıştırılmış gider; içerik aynıdır', async () => {
    const y = await iste('/assets/index-BMCPWWXW.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(y.basliklar['content-encoding']).toBe('gzip');
    expect(y.basliklar['vary']).toBe('Accept-Encoding');
    expect(y.govde !== undefined && y.govde.length < BETIK.length / 4).toBe(true);
    expect(gunzipSync(y.govde as Buffer).toString('utf8')).toBe(BETIK);
    const sayfa = await iste('/', { 'accept-encoding': 'gzip' });
    expect(sayfa.basliklar['content-encoding']).toBe('gzip');
    expect(sayfa.basliklar['content-security-policy']).toContain(ozet(KOPRU));
  });

  it('gzip istemeyene, küçük dosyaya, yazı tipine ve .gz dosyasına sıkıştırma yapılmaz', async () => {
    for (const [yol, kabul] of [
      ['/vendor/kutuphane.js', ''], ['/vendor/kutuphane.js', 'gzip;q=0, br'], ['/vendor/kucuk.js', 'gzip'],
      ['/assets/yazi-DY7AcnAa.woff2', 'gzip'], ['/vendor/veri.gz', 'gzip'],
    ] as const) {
      const y = await iste(yol, { 'accept-encoding': kabul });
      expect(y.basliklar['content-encoding'], `${yol} ${kabul}`).toBeUndefined();
      expect(y.govde?.length).toBeGreaterThan(0);
    }
    expect((await iste('/vendor/kutuphane.js')).govde?.toString('utf8')).toBe(BETIK);
  });

  it('ETag tutarsa 304 ve gövdesiz döner; dosya değişince etiket değişir ve yeni içerik gider', async () => {
    const ilk = await iste('/vendor/kutuphane.js', { 'accept-encoding': 'gzip' });
    const etiket = ilk.basliklar['etag'] ?? '';
    const tekrar = await iste('/vendor/kutuphane.js', { 'accept-encoding': 'gzip', 'if-none-match': etiket });
    expect(tekrar.statusCode).toBe(304);
    expect(tekrar.govde).toBeUndefined();
    const sayfaEtiketi = (await iste('/')).basliklar['etag'] ?? '';
    const sayfa304 = await iste('/', { 'if-none-match': sayfaEtiketi });
    expect(sayfa304.statusCode).toBe(304);
    expect(sayfa304.basliklar['content-security-policy']).toContain(ozet(KOPRU));
    // Ret: sıkıştırılmamış kopyanın etiketi sıkıştırılmışınkini karşılamaz.
    expect((await iste('/vendor/kutuphane.js', { 'if-none-match': etiket })).statusCode).toBe(200);
    const yeni = `${BETIK} var yeni = 2;`;
    await writeFile(join(kok, 'vendor', 'kutuphane.js'), yeni);
    await utimes(join(kok, 'vendor', 'kutuphane.js'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const degisik = await iste('/vendor/kutuphane.js', { 'accept-encoding': 'gzip', 'if-none-match': etiket });
    expect(degisik.statusCode).toBe(200);
    expect(degisik.basliklar['etag']).not.toBe(etiket);
    expect(gunzipSync(degisik.govde as Buffer).toString('utf8')).toBe(yeni);
  });
});
