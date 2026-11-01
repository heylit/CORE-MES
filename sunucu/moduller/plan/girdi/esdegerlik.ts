import type { MotorVerisi } from './tipler.ts';

// Eşdeğerlik (1683 b, 2): aynı veri için eski yol (motor/girdi.betik) ile yeni yol (girdi/ dilimleri) aynı motor girdisini vermeli; fark
// alan alan yazılır. Nesne anahtarlarının sırası fark sayılmaz (çalışma jsonb'de durur, eski yol da böyle karşılaştırır: girdi.betik rrEsit);
// dizilerin sırası anlamlıdır (sipariş sırası motorda geliş sırasıdır). undefined ile alanın hiç olmaması aynıdır (JSON'a yazılmaz).

export interface GirdiFarki {
  // 'tezgahlar[0].ucret' biçiminde yol; kök farkta boş.
  yol: string;
  eski: unknown;
  yeni: unknown;
}

export const EN_COK_FARK = 50;

const nesneMi = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const tanimli = (o: Record<string, unknown>): string[] => Object.keys(o).filter((k) => o[k] !== undefined);
const yolEkle = (yol: string, k: string): string => (yol === '' ? k : `${yol}.${k}`);

// NaN ve sonsuz JSON'da null olur; eski yol değeri JSON kopyasıyla taşır. Sayılar Object.is ile değil JSON eşitliğiyle karşılaştırılır.
function ilkelEsit(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || (!Number.isFinite(a) && !Number.isFinite(b) && String(a) === String(b));
  return a === b;
}

function topla(eski: unknown, yeni: unknown, yol: string, l: GirdiFarki[], sinir: number): void {
  if (l.length >= sinir) return;
  if (Array.isArray(eski) && Array.isArray(yeni)) {
    if (eski.length !== yeni.length) l.push({ yol: yolEkle(yol, 'length'), eski: eski.length, yeni: yeni.length });
    const n = Math.min(eski.length, yeni.length);
    for (let i = 0; i < n && l.length < sinir; i++) topla(eski[i], yeni[i], `${yol}[${String(i)}]`, l, sinir);
    return;
  }
  if (nesneMi(eski) && nesneMi(yeni)) {
    const anahtarlar = [...new Set([...tanimli(eski), ...tanimli(yeni)])].sort();
    for (const k of anahtarlar) {
      if (l.length >= sinir) return;
      topla(eski[k], yeni[k], yolEkle(yol, k), l, sinir);
    }
    return;
  }
  if (!ilkelEsit(eski, yeni)) l.push({ yol, eski, yeni });
}

// İki değerin farkları, en çok `sinir` tane (büyük farkta ilk farklar yeter, test iletisi okunur kalır).
export function girdiFarki(eski: unknown, yeni: unknown, sinir: number = EN_COK_FARK): GirdiFarki[] {
  const l: GirdiFarki[] = [];
  topla(eski, yeni, '', l, sinir);
  return l;
}

// Bir dilimin kurduğu alanlar eski yolun çalışma verisiyle (S.D) karşılaştırılır; dilimin kurmadığı alanlara bakılmaz.
export function dilimFarki<A extends keyof MotorVerisi>(
  eskiD: Record<string, unknown>, yeni: Pick<MotorVerisi, A>, alanlar: readonly A[], sinir: number = EN_COK_FARK,
): GirdiFarki[] {
  const l: GirdiFarki[] = [];
  for (const a of alanlar) {
    if (l.length >= sinir) break;
    topla(eskiD[a], yeni[a], a, l, sinir);
  }
  return l;
}

// Test iletisi: her fark tek satır.
export function farkMetni(l: readonly GirdiFarki[]): string {
  const deger = (x: unknown): string => (x === undefined ? 'yok' : JSON.stringify(x));
  return l.map((f) => `${f.yol || '(kök)'}: eski ${deger(f.eski)}, yeni ${deger(f.yeni)}`).join('\n');
}
