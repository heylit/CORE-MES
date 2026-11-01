import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ADR'nin eskimesi çoğunlukla koda bağlı cümlenin kod değişince kalmasıdır; çapa, durum ve bağ denetimi bunu birleşmeden önce gösterir.
// Anlamsal çelişkiyi bu araç bulamaz; bulduğu yalnız biçim ve bağdır (belgeler/adr/README.md, Kural 8).

export const DURUMLAR = ['öneri', 'kabul', 'ertelendi', 'kısmen yerine geçildi', 'yerine geçildi', 'kaldırıldı'] as const;
type Durum = (typeof DURUMLAR)[number];
// CLAUDE.md bu durumlardaki ADR'ye satırda durumu söylemeden atıf yapabilir: karar yürürlüktedir.
const YURURLUKTE: readonly string[] = ['kabul', 'kısmen yerine geçildi'];
const IZINLI_IP = new Set(['127.0.0.1', '0.0.0.0']);
// Kod bu durumlardaki ADR'ye dayanamaz: karar artık yürürlükte değildir, kod yeni karara ya da kaldırılışa uymalıdır.
const KODA_KAPALI: readonly string[] = ['yerine geçildi', 'kaldırıldı'];
// Şablon (belgeler/adr/SABLON.md) bu numaradan sonraki ADR'lerde zorunludur; eskiler değişmezlik kuralı gereği yeniden biçimlenmez.
export const SABLON_ILK_NO = 25;
export const SABLON_BASLIKLARI = ['## Bağlam', '## Karar', '## Sonuçlar'] as const;
// Kodda ADR atfı aranan klasörler ve uzantılar; denetimin kendi dosyaları uydurma atıf taşır.
const KOD_KLASORLERI = ['sunucu', 'istemci/src', 'paylasilan', 'araclar', 'arkon', 'ekran-testleri', 'saat', 'test-robotu'];
const KOD_UZANTISI = /\.(ts|tsx|js|mjs|cs|sql|betik|kt)$/;
const ATLANAN_KLASOR = new Set(['node_modules', 'dist', 'build', '.gradle']);
const ATLANAN_DOSYA = new Set(['araclar/adr-denetimi.ts', 'araclar/adr-denetimi.test.ts']);

export interface DizinSatiri {
  no: string;
  durum: string;
  degistirir: string[];
  degistiren: string[];
  capalar: string[];
}

export interface AdrDosyasi {
  no: string;
  dosya: string;
  metin: string;
}

export interface KodAtfi {
  yol: string;
  satir: number;
  no: string;
}

export interface Girdi {
  dizin: string;
  adrler: AdrDosyasi[];
  claude: string;
  kodAtiflari: KodAtfi[];
  yolVarMi: (yol: string) => boolean;
  dosyaOku: (yol: string) => string | null;
}

const satirlar = (metin: string): string[] => metin.split(/\r?\n/);
const liste = (hucre: string): string[] => (hucre.trim() === '-' ? [] : hucre.split(',').map((p) => p.trim()).filter((p) => p !== ''));

export function dizinOku(metin: string): DizinSatiri[] {
  const sonuc: DizinSatiri[] = [];
  for (const satir of satirlar(metin)) {
    if (!/^\|\s*\d{4}\s*\|/.test(satir)) continue;
    const h = satir.split('|').slice(1, -1).map((x) => x.trim());
    sonuc.push({ no: h[0] ?? '', durum: h[2] ?? '', degistirir: liste(h[3] ?? ''), degistiren: liste(h[4] ?? ''), capalar: liste(h[6] ?? '') });
  }
  return sonuc;
}

// "Durum: kabul edildi (05.10.2026)" -> "kabul"; ilk ayraca kadar okunur.
export function dosyaDurumu(metin: string): string | null {
  const satir = satirlar(metin).find((s) => s.startsWith('Durum:'));
  if (satir === undefined) return null;
  const ham = satir.slice('Durum:'.length).trim().split(/[(.;:,]/)[0]?.trim() ?? '';
  return ham === 'kabul edildi' ? 'kabul' : ham;
}

function ipAdresleri(metin: string): string[] {
  return [...metin.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.]*\d)/g)].map((m) => m[1] ?? '').filter((ip) => !IZINLI_IP.has(ip));
}

export function adrDenetle(g: Girdi): string[] {
  const hatalar: string[] = [];
  const dizin = dizinOku(g.dizin);
  const satirNo = new Map(dizin.map((s) => [s.no, s]));
  const dosyaNo = new Map(g.adrler.map((a) => [a.no, a]));

  for (const s of dizin) {
    if (!dosyaNo.has(s.no)) hatalar.push(`ADR ${s.no}: dizinde var, dosyası yok`);
    if (!(DURUMLAR as readonly string[]).includes(s.durum)) hatalar.push(`ADR ${s.no}: dizindeki durum listede yok: "${s.durum}"`);
    // Yerine geçilen ADR okuyanı geçerli karara götürmelidir; yönlendirmesiz "yerine geçildi" ölü uçtur.
    if (s.durum.endsWith('yerine geçildi') && s.degistiren.length === 0) hatalar.push(`ADR ${s.no}: "${s.durum}" ama Değiştiren sütunu boş`);
    for (const d of s.degistirir) {
      if (!satirNo.get(d)?.degistiren.includes(s.no)) hatalar.push(`ADR ${s.no}: ${d}'yi değiştirir, ama ${d}'nin Değiştiren sütununda yok`);
    }
    for (const d of s.degistiren) {
      if (!satirNo.get(d)?.degistirir.includes(s.no)) hatalar.push(`ADR ${s.no}: Değiştiren ${d}, ama ${d}'nin Değiştirir sütununda yok`);
    }
    for (const capa of s.capalar) {
      const [yol = '', ad] = capa.split('#');
      if (!g.yolVarMi(yol)) {
        hatalar.push(`ADR ${s.no}: çapa yok: ${yol}`);
        continue;
      }
      if (ad !== undefined && !(g.dosyaOku(yol) ?? '').includes(ad)) hatalar.push(`ADR ${s.no}: çapadaki ad dosyada yok: ${yol}#${ad}`);
    }
  }

  for (const a of g.adrler) {
    const s = satirNo.get(a.no);
    if (s === undefined) {
      hatalar.push(`ADR ${a.no}: dosyası var, dizinde yok (${a.dosya})`);
      continue;
    }
    const durum = dosyaDurumu(a.metin);
    if (durum !== s.durum) hatalar.push(`ADR ${a.no}: dosyadaki durum "${durum ?? 'yok'}", dizindeki "${s.durum}"`);
    if (a.metin.includes('/mnt/')) hatalar.push(`ADR ${a.no}: depo dışı yol (/mnt/) yazılmış`);
    for (const ip of ipAdresleri(a.metin)) hatalar.push(`ADR ${a.no}: IP adresi yazılmış: ${ip}`);
    for (const m of a.metin.matchAll(/ADR (\d{4})/g)) {
      const no = m[1] ?? '';
      if (!satirNo.has(no) && !dosyaNo.has(no)) hatalar.push(`ADR ${a.no}: olmayan ADR'ye atıf: ${no}`);
    }
    if (Number(a.no) >= SABLON_ILK_NO) {
      const basliklar = new Set(satirlar(a.metin).map((x) => x.trim()));
      for (const b of SABLON_BASLIKLARI) if (!basliklar.has(b)) hatalar.push(`ADR ${a.no}: şablon başlığı yok: ${b}`);
    }
  }
  for (const k of g.kodAtiflari) {
    const s = satirNo.get(k.no);
    if (s === undefined) hatalar.push(`${k.yol}:${k.satir}: olmayan ADR'ye atıf: ${k.no}`);
    else if (KODA_KAPALI.includes(s.durum)) hatalar.push(`${k.yol}:${k.satir}: ADR ${k.no} "${s.durum}"; kod yürürlükteki karara atıf yapmalı`);
  }
  for (const ip of ipAdresleri(g.dizin)) hatalar.push(`Dizin: IP adresi yazılmış: ${ip}`);

  satirlar(g.claude).forEach((satir, i) => {
    for (const m of satir.matchAll(/ADR (\d{4})/g)) {
      const no = m[1] ?? '';
      const s = satirNo.get(no);
      if (s === undefined) {
        hatalar.push(`CLAUDE.md:${i + 1}: olmayan ADR'ye atıf: ${no}`);
        continue;
      }
      if (!YURURLUKTE.includes(s.durum) && !satir.includes(s.durum as Durum)) {
        hatalar.push(`CLAUDE.md:${i + 1}: ADR ${no} "${s.durum}" durumunda; satır bunu söylemeden atıf yapıyor`);
      }
    }
  });
  return hatalar;
}

export function kodAtiflariniBul(yol: string, metin: string): KodAtfi[] {
  const sonuc: KodAtfi[] = [];
  satirlar(metin).forEach((satir, i) => {
    for (const m of satir.matchAll(/\bADR[ -]?(\d{4})\b/g)) sonuc.push({ yol, satir: i + 1, no: m[1] ?? '' });
  });
  return sonuc;
}

function kodDosyalari(kok: string, goreli: string): string[] {
  const tam = join(kok, ...goreli.split('/'));
  if (!existsSync(tam)) return [];
  const sonuc: string[] = [];
  for (const g of readdirSync(tam, { withFileTypes: true })) {
    if (ATLANAN_KLASOR.has(g.name)) continue;
    const alt = `${goreli}/${g.name}`;
    if (g.isDirectory()) sonuc.push(...kodDosyalari(kok, alt));
    else if (KOD_UZANTISI.test(g.name) && !ATLANAN_DOSYA.has(alt)) sonuc.push(alt);
  }
  return sonuc;
}

export function depodanGirdi(kok: string): Girdi {
  const adrKlasoru = join(kok, 'belgeler', 'adr');
  const adrler = readdirSync(adrKlasoru)
    .filter((d) => /^\d{4}-.+\.md$/.test(d))
    .map((d) => ({ no: d.slice(0, 4), dosya: d, metin: readFileSync(join(adrKlasoru, d), 'utf8') }));
  const tam = (yol: string) => join(kok, ...yol.split('/'));
  return {
    dizin: readFileSync(join(adrKlasoru, 'README.md'), 'utf8'),
    adrler,
    claude: readFileSync(join(kok, 'CLAUDE.md'), 'utf8'),
    kodAtiflari: KOD_KLASORLERI.flatMap((k) => kodDosyalari(kok, k)).flatMap((y) => kodAtiflariniBul(y, readFileSync(tam(y), 'utf8'))),
    yolVarMi: (yol) => yol !== '' && !yol.includes('..') && existsSync(tam(yol)),
    dosyaOku: (yol) => (statSync(tam(yol)).isFile() ? readFileSync(tam(yol), 'utf8') : null),
  };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const hatalar = adrDenetle(depodanGirdi(resolve(fileURLToPath(import.meta.url), '..', '..')));
  for (const h of hatalar) console.error(h);
  if (hatalar.length > 0) process.exit(1);
  console.log('ADR denetimi temiz.');
}
