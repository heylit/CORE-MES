import { cm1Coz, TUR_SIRASI } from '#paylasilan/etiket-kodu.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { KOD_KENAR_MODUL, type KodSimgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { kodMatrisi } from './kod-matrisi.ts';

// Özet kodun (CM1) yazılışı: biçim ve alan sırası paylasilan/etiket-kodu.ts'in okuduğu biçimdir (KURGU 3.1, 3.4). Saf kural.
// Sığmayan içerik sondan düşer: önce işlem listesi kısalır ("+15K"), sonra alanlar sondan; kimlik ve basım tarihi (BT) hiç düşmez.

// KURGU 3.5: etiket boyuna göre kodun en büyük kenarı (modül sayısı). 0,375 mm modülle 26 ≈ 11 mm, 40 ≈ 16,5 mm, 52 ≈ 21 mm.
export function kodUstSiniri(genislik: number, yukseklik: number): number {
  if (genislik < 75) return 26;
  if (yukseklik <= 50) return 40;
  if (yukseklik <= 75) return 48;
  return 52;
}

// Kart 3562 (şerit): kod şeridin ortasında, kodun en büyük hali (üst sınırdaki matris, 0,375 mm modül 50x25'te, 0,5 mm öbür boylarda) şeride sığar.
// Şerit eni boya göre sabittir; sığmayan kod küçültülmez, alanı kırpılır (cm1Sigdir). Daha küçük matris aynı kutuda biraz büyük modülle basılır.
export const seritEni = (genislik: number, yukseklik: number): number => (genislik < 75 ? 21 : yukseklik >= 150 ? 36 : 30);
export const seritModulu = (genislik: number): number => (genislik < 75 ? 0.375 : 0.5);
export const seritKodKenari = (genislik: number, yukseklik: number): number => (kodUstSiniri(genislik, yukseklik) + 2 * KOD_KENAR_MODUL) * seritModulu(genislik);

// El okuyucu klavyeyle yazar ve kod büyük harf okunur (kod-sozlugu.ts): Türkçe harf ASCII'ye, büyük harfe çevrilir; "/" ve ":" ayraçtır.
export function kodMetni(deger: string): string {
  return deger
    .replace(/ı/g, 'i')
    .replace(/[Øø]/g, 'O')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[/:]/g, '-')
    .replace(/[^A-Z0-9 .+\-_*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const kimlikMetni = (deger: string): string => kodMetni(deger).replace(/ /g, '');

// 'YYYY-AA-GG' (tesis günü) -> 'YYAAGG'
export const basimKodu = (basim: Date): string => tesisGunu(basim).replace(/-/g, '').slice(2);

export type KodAlanlari = Readonly<Record<string, string | null | undefined>>;

// Kimlik ilk alandır. `alanlar` TUR_SIRASI'ndaki sırayla yazılır; değeri olmayan (null, boş) alan hiç yazılmaz, sıfır uydurulmaz.
export function cm1Yaz(kimlik: { anahtar: string; deger: string }, alanlar: KodAlanlari, basim: Date, siraVerilen?: readonly string[]): string {
  const sira = siraVerilen ?? TUR_SIRASI[kimlik.anahtar] ?? [];
  const parcalar = [`${kimlik.anahtar}:${kimlikMetni(kimlik.deger)}`];
  for (const anahtar of sira.slice(1)) {
    if (anahtar === 'BT') continue;
    const d = alanlar[anahtar];
    if (d === null || d === undefined) continue;
    const m = anahtar === 'OPS' ? kodMetni(d).replace(/ /g, '') : kodMetni(d);
    if (m !== '') parcalar.push(`${anahtar}:${m}`);
  }
  parcalar.push(`BT:${basimKodu(basim)}`);
  return ['CM1', ...parcalar].join('/');
}

export interface SigmisKod { metin: string; n: number; eksik: string[]; alanlar: string[] }
const yan = (metin: string, simge: KodSimgesi): number => kodMatrisi(metin, simge).length;

// Üst sınıra sığmayan kodu kırpar. Düşen alan varsa sona "/+N" eklenir (N düşen alan sayısı); kırpılan işlem listesi eksik'te
// "OPS <kaç işlem>" diye görünür. CM1 olmayan metin (eski önekli kimlik) olduğu gibi döner.
// Hiçbir yerleşimde düşmeyen alanlar (KURGU 3.8): kimlik, basım tarihi (BT), son kullanma (SKT) ve kalite durumu (DRM).
const KORUNAN = new Set(['SKT', 'DRM', 'BT']);
export function cm1Sigdir(metin: string, ustSinir: number, simge: KodSimgesi = 'dm'): SigmisKod {
  const ozet = cm1Coz(metin);
  const parcalar = metin.split('/').slice(1);
  if (ozet === null || parcalar.length === 0) return { metin, n: yan(metin, simge), eksik: [], alanlar: [] };
  let alanlar = parcalar.map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)] as [string, string]);
  const yaz = (l: readonly [string, string][], dusen: number): string => ['CM1', ...l.map(([a, d]) => `${a}:${d}`), ...(dusen > 0 ? [`+${dusen}`] : [])].join('/');
  const eksik: string[] = [];
  let n = yan(yaz(alanlar, 0), simge);
  if (n > ustSinir) {
    const i = alanlar.findIndex(([a]) => a === 'OPS');
    const ops = i < 0 ? null : alanlar[i];
    if (ops !== undefined && ops !== null) {
      const tum = ops[1].split('+');
      for (let k = tum.length - 1; k >= 1; k--) {
        const aday = alanlar.map((x, j): [string, string] => (j === i ? ['OPS', `${tum.slice(0, k).join('+')}+${tum.length - k}K`] : x));
        if (yan(yaz(aday, 0), simge) <= ustSinir) { alanlar = aday; eksik.push(`OPS ${tum.length - k}`); break; }
      }
      n = yan(yaz(alanlar, 0), simge);
    }
  }
  let dusen = 0;
  for (;;) {
    if (n <= ustSinir) break;
    // Sondan ilk korunmayan alan düşer; korunanlar ve kimlik kalır.
    let i = alanlar.length - 1;
    while (i > 0 && KORUNAN.has(alanlar[i]?.[0] ?? '')) i -= 1;
    const d = i > 0 ? alanlar[i] : undefined;
    if (d === undefined) break;
    alanlar.splice(i, 1);
    eksik.unshift(d[0]);
    dusen += 1;
    n = yan(yaz(alanlar, dusen), simge);
  }
  return { metin: yaz(alanlar, dusen), n, eksik, alanlar: alanlar.map(([a]) => a) };
}
