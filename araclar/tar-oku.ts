import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

// Güncelleme paketinin yükü `git archive --format=tar.gz` çıktısıdır (kart #1210). Yeni paket istemeden okunur: ustar başlığı,
// pax uzun adı ve git'in genel yorum başlığı. Paket imzalı olsa da açılan yol yine denetlenir: tek kuşkulu girdi bütün arşivi düşürür.

export interface TarGirdisi {
  // Depo biçiminde göreli yol: eğik çizgi ayırır, sonda eğik çizgi yoktur.
  yol: string;
  tur: 'dosya' | 'klasor';
  veri: Buffer;
}

const BLOK = 512;

function metin(blok: Buffer, bas: number, uzunluk: number): string {
  const parca = blok.subarray(bas, bas + uzunluk);
  const son = parca.indexOf(0);
  return parca.subarray(0, son < 0 ? parca.length : son).toString('utf8');
}

function sekizli(blok: Buffer, bas: number, uzunluk: number, ad: string): number {
  const deger = metin(blok, bas, uzunluk).trim();
  if (!/^[0-7]+$/.test(deger)) throw new Error(`Arşiv bozuk: ${ad} okunamadı.`);
  return Number.parseInt(deger, 8);
}

function saglamaDogru(blok: Buffer): boolean {
  let toplam = 0;
  for (let i = 0; i < BLOK; i++) toplam += i >= 148 && i < 156 ? 0x20 : (blok[i] ?? 0);
  return toplam === sekizli(blok, 148, 8, 'sağlama');
}

// pax kaydı: "<uzunluk> <anahtar>=<değer>\n"; yalnız path kullanılır.
function paxYolu(veri: Buffer): string | null {
  let i = 0;
  let yol: string | null = null;
  while (i < veri.length) {
    const bosluk = veri.indexOf(0x20, i);
    if (bosluk < 0) throw new Error('Arşiv bozuk: pax kaydı okunamadı.');
    const uzunluk = Number(veri.subarray(i, bosluk).toString('ascii'));
    if (!Number.isInteger(uzunluk) || uzunluk <= 0 || i + uzunluk > veri.length) throw new Error('Arşiv bozuk: pax kaydı okunamadı.');
    const kayit = veri.subarray(bosluk + 1, i + uzunluk - 1).toString('utf8');
    const esit = kayit.indexOf('=');
    if (esit > 0 && kayit.slice(0, esit) === 'path') yol = kayit.slice(esit + 1);
    i += uzunluk;
  }
  return yol;
}

// Mutlak yol, sürücü harfi, ters eğik çizgi ve `..` reddedilir; açılan her şey hedef klasörün içinde kalır.
export function guvenliYol(ham: string): string {
  const yol = ham.replace(/^\.\//, '').replace(/\/+$/, '');
  const parcalar = yol.split('/');
  if (yol === '' || yol.startsWith('/') || yol.includes('\\') || /^[A-Za-z]:/.test(yol) || yol.includes('\0')
    || parcalar.some((p) => p === '' || p === '.' || p === '..')) {
    throw new Error(`Arşivde güvensiz yol: ${JSON.stringify(ham)}`);
  }
  return yol;
}

export function tarOku(gz: Buffer): TarGirdisi[] {
  const tar = gunzipSync(gz);
  const girdiler: TarGirdisi[] = [];
  let uzunAd: string | null = null;
  for (let i = 0; i + BLOK <= tar.length;) {
    const blok = tar.subarray(i, i + BLOK);
    if (blok.every((b) => b === 0)) break;
    if (!saglamaDogru(blok)) throw new Error('Arşiv bozuk: başlık sağlaması tutmuyor.');
    const boyut = sekizli(blok, 124, 12, 'boyut');
    const tur = String.fromCharCode(blok[156] ?? 0);
    const veri = tar.subarray(i + BLOK, i + BLOK + boyut);
    if (veri.length !== boyut) throw new Error('Arşiv bozuk: dosya eksik.');
    i += BLOK + Math.ceil(boyut / BLOK) * BLOK;
    if (tur === 'g') continue;
    if (tur === 'x') { uzunAd = paxYolu(veri); continue; }
    if (tur === 'L') { uzunAd = metin(veri, 0, veri.length); continue; }
    const onEk = metin(blok, 345, 155);
    const ad = uzunAd ?? (onEk === '' ? metin(blok, 0, 100) : `${onEk}/${metin(blok, 0, 100)}`);
    uzunAd = null;
    if (tur === '0' || tur === '\0') girdiler.push({ yol: guvenliYol(ad), tur: 'dosya', veri: Buffer.from(veri) });
    else if (tur === '5') girdiler.push({ yol: guvenliYol(ad), tur: 'klasor', veri: Buffer.alloc(0) });
    else throw new Error(`Arşivde desteklenmeyen girdi (tür ${JSON.stringify(tur)}): ${ad}`);
  }
  return girdiler;
}

// Önce bütün arşiv okunup denetlenir, sonra yazılır: bozuk arşiv yarım klasör bırakmaz.
export function tarAc(gz: Buffer, hedef: string): number {
  const girdiler = tarOku(gz);
  for (const g of girdiler) {
    const yol = join(hedef, ...g.yol.split('/'));
    if (g.tur === 'klasor') { mkdirSync(yol, { recursive: true }); continue; }
    mkdirSync(dirname(yol), { recursive: true });
    writeFileSync(yol, g.veri, { flag: 'wx' });
  }
  return girdiler.filter((g) => g.tur === 'dosya').length;
}
