import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';

// Planlama sayfalarının ortak ısı haritası (bugünkü çerçevenin zz30-isi katmanı): satır × sütun ızgarasının veri biçimi ve saf yardımcıları.
// Görünümler (P2, P4, P5, P6) satırları kendi verisinden kurar; çizim IsiHaritasi.tsx'tedir.

// 0: işaret yok; 1-4: az, orta, çok, en koyu (termini kaydırır, kapasite aşılıyor).
export type IsiKademe = 0 | 1 | 2 | 3 | 4;
// pasif: bakılacak bir şey yok ama karşılandı da değil ("Bağlı iş yok", "Termin yok"); simge gri.
export type IsiTonu = 'hata' | 'uyari' | 'tamam' | 'pasif' | '';
export interface IsiHucresi {
  kd?: IsiKademe | null; sm?: SimgeAdi; v?: string;
  iyi?: boolean; is?: boolean; bayrak?: boolean; oneri?: boolean; kapali?: boolean;
  // Tahmini değerin nedeni ("tarih girilmedi, olağan süreye göre"); doluysa hücre kesik çizgili.
  tahmin?: string;
  etiket?: string;
}
export interface IsiSutunu { k: string; ad: string; alt?: string; uzun?: string; bugun?: boolean }
export interface IsiSatiri { k: string; ad: string; alt?: string; simge?: SimgeAdi; ton?: IsiTonu; gizli?: boolean; h: Record<string, IsiHucresi> }
export interface IsiUstDurumu { ton: 'hata' | 'uyari' | 'tamam'; simge: SimgeAdi; metin: string }
export type IsiGenisligi = 'gun' | 'hafta' | 'donem' | 'kalem';

// Bekleme ya da gecikme saatinden kademe: sekiz saatlik bir vardiya, bir gün, üç gün.
export const saatKademesi = (h: number | null): IsiKademe | null => (h == null ? null : h <= 0.05 ? 0 : h < 8 ? 1 : h < 24 ? 2 : h < 72 ? 3 : 4);
// Orandan kademe; e dört eşik (yıllık plan: %50, 75, 90, 100).
export function oranKademesi(x: number | null, e: readonly [number, number, number, number]): IsiKademe | null {
  if (x == null || !Number.isFinite(x)) return null;
  return x < e[0] ? 0 : x < e[1] ? 1 : x < e[2] ? 2 : x < e[3] ? 3 : 4;
}
export const kisaSure = (h: number | null): string => (h == null ? '' : h < 48 ? `${Math.round(h)}s` : `${Math.round(h / 24)}g`);

// Hücre birleştirme: sonraki işaret öncekinin kademesini düşürmez, etiketler virgülle eklenir.
export function hucreKoy(h: Record<string, IsiHucresi>, k: string, o: IsiHucresi): IsiHucresi {
  const c = h[k] ?? (h[k] = {});
  for (const [a, v] of Object.entries(o) as [keyof IsiHucresi, IsiHucresi[keyof IsiHucresi]][]) {
    if (v === undefined) continue;
    if (a === 'kd' && c.kd != null && v != null && c.kd > (v as number)) continue;
    if (a === 'etiket' && c.etiket) { c.etiket += `, ${String(v)}`; continue; }
    (c as Record<string, unknown>)[a] = v;
  }
  return c;
}

// Boş hücre: hiçbir işaret yoksa düğme değil, kesik çizgili yer tutucudur.
export const hucreBos = (h: IsiHucresi | undefined): boolean => !h || (h.kd == null && !h.v && !h.sm && !h.is && !h.iyi && !h.bayrak && !h.oneri);

// Tezgâh grubu kimliğinden satır adı (zz30-isi IS_GRUP, zn-kesif BR_GRUP_AD); bilinmeyen kimlik olduğu gibi yazılır.
const GRUP_ADI: Record<string, string> = {
  testere: 'Testere', torna: 'Torna', freze: 'Freze', '5eksen': '5 eksen', taslama: 'Taşlama', tesviye: 'Tesviye', yikama: 'Yıkama', olcum: 'Ölçüm', fason: 'Fason', montaj: 'Montaj',
};
export const grupAdi = (g: string): string => GRUP_ADI[g] ?? g;

export const KADEME_ADI: Record<number, string> = { 1: 'Az', 2: 'Orta', 3: 'Çok', 4: 'Termini kaydırır' };
