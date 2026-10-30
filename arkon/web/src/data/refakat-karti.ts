/* Refakat kartı (kart #156, Soru 134, 1337 a): iş üç yoldan kartla açılır: sıradaki işin altında istasyonda satırı olan kartlardan "Aç",
   Üretim Terminali'nde el okuyucuyla kartın okutulması ya da Malzeme Teslim'de kart okutulup "İş emrini aç" (TMI adresi
   `?emir=<id>&kart=<id>`). Kart seçilmezse iş kartsız açılır;
   kartı stok sayımdan bulur. Seçilen kart işin üzerinde durur (`kart`) ve her sayım satırına `refakatPartisiId` olarak yazılır. */
import { tmiPlani } from './tmi-plan';

// Sunucunun verdiği kart (GET /arkon/refakat-kartlari). İstisna kartının lotu yoktur; sayılan ve sınır bilinmiyorsa null (Soru 132).
export interface RefakatKarti {
  id: number; uretimEmriId: number; etiket: string; lotNo: string | null;
  malzemeKod: string | null; malzemeAd: string | null; birim: string | null; verilen: string;
  istasyondaSatirVar: boolean; sayilan: number | null; sinir: number | null;
}

// Terminal işin altında yalnız bu istasyonda satırı olan kartları gösterir.
export const istasyondakiKartlar = (kartlar: readonly RefakatKarti[], emirId: number | null): RefakatKarti[] =>
  emirId === null ? [] : kartlar.filter((k) => k.uretimEmriId === emirId && k.istasyondaSatirVar);

// Sınır yumuşak kilittir (Soru 132): dolunca söylenir, sayım durmaz. Sınırı bilinmeyen kart için sınır gösterilmez.
export const sinirMetni = (k: Pick<RefakatKarti, 'sayilan' | 'sinir'>): string | null =>
  k.sayilan === null || k.sinir === null ? null : `${k.sayilan} / ${k.sinir}`;
export const kartDoldu = (k: Pick<RefakatKarti, 'sayilan' | 'sinir'>): boolean => k.sayilan !== null && k.sinir !== null && k.sayilan >= k.sinir;

// Sayım satırının kart alanı; kartsız işte alan yazılmaz (sunucu kartsız sayımı stokta kartla eşler).
export const sayimKartAlani = (kart: unknown): { refakatPartisiId: number } | null =>
  typeof kart === 'number' && Number.isInteger(kart) && kart > 0 ? { refakatPartisiId: kart } : null;

// Sorulacak emirler: bitmemiş işlerin emirleri, tekrarsız ve sıralı (sorgu anahtarı değişmeden yeniden okunmaz); sunucu en çok 50 alır.
export const AZAMI_KART_EMRI = 50;
// Sayılan ve sınır sayımla değişir; liste dakikada bir yenilenir (yumuşak kilit, anlık olması gerekmez).
export const KART_YENILEME_MS = 60_000;
export function kartEmirleri(isler: readonly { state?: string; emirId: number | null }[]): number[] {
  const l = [...new Set(isler.filter((x) => x.state !== 'done' && x.emirId !== null).map((x) => x.emirId as number))].sort((a, b) => a - b);
  return l.slice(0, AZAMI_KART_EMRI);
}

interface RefakatPaketi { id?: unknown; machine?: string; no?: string; tmi?: { emirId?: number; opNo?: number; plan?: unknown } | null }
interface RefakatIsi { no?: string; state?: string; pkg?: RefakatPaketi | null }

export type RefakatSonucu = { tur: 'ac'; sira: number } | { tur: 'baska-istasyon'; istasyon: string | null } | { tur: 'yok' };

// Kart #1062 kararı: emrin bu istasyondaki sıradaki bitmemiş işi açılır, başlatılmaz. Karar yalnız okur, kayıt yazmaz.
export function refakatIsi(emirId: number, isler: readonly RefakatIsi[], paketler: readonly RefakatPaketi[]): RefakatSonucu {
  // Rotalı emirde iş emri paketi (`tmi.emirId`), rotasız emirde emir paketi (`tmi-ue-<id>`), emir-secimi.ts emirSirasi gibi.
  const emrin = (p: RefakatPaketi | null | undefined): boolean => !!p && (p.tmi?.emirId === emirId || p.id === `tmi-ue-${emirId}`);
  const sira = isler.findIndex((x) => emrin(x.pkg) && x.state !== 'done');
  if (sira >= 0) return { tur: 'ac', sira };
  // Ne sırada ne pakette izi olan emir bu cihazda bilinmiyor: "bu istasyonda işi yok" demek yanıltır.
  if (!isler.some((x) => emrin(x.pkg)) && !paketler.some(emrin)) return { tur: 'yok' };
  // Bu istasyonda bitmemiş işi yok: emrin bitmemiş işlerinden en küçük operasyon numaralısının istasyonu söylenir. Sunucu bitmiş iş
  // emrinin paketinde planı boş bırakır (tmi-plan.ts); bu istasyonda bitirilen iş de sayılmaz.
  const bitenler = new Set(isler.filter((x) => x.state === 'done' && x.pkg).map((x) => x.pkg));
  const sonraki = paketler
    .filter((p) => emrin(p) && !bitenler.has(p) && tmiPlani(p as Parameters<typeof tmiPlani>[0]) !== null)
    .sort((a, b) => (a.tmi?.opNo ?? 0) - (b.tmi?.opNo ?? 0))[0];
  return { tur: 'baska-istasyon', istasyon: sonraki?.machine ?? null };
}
