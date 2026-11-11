import type { KayitTuru, OzelOlcu, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { kayitSablonTuru } from './kayit-secimi.ts';
import { olcuCoz } from './ozel-olcu.ts';

// 2916 a: olay ekranındaki "etiket bas" bu cihazın varsayılan yazıcısına gider. Varsayılan cihaz başınadır: yazıcı fiziksel olarak
// cihazın yanındadır, kişi başka bilgisayara geçince oradakini seçer. Şablon türü başına bir yazıcı ve şablon tutulur (lot 100x50,
// konum 50x25 başka rulolardır). Yazıcının geçerliliğini sunucu her baskıda yeniden denetler; burada yalnız seçim saklanır.
// olcu: standart dışı rulo (şablonun tasarımı bu ölçüye orantılı basılır); yoksa şablonun kendi ölçüsü.
export interface CihazYazicisi { yaziciId: number; yaziciAd: string; sablonAnahtar: string; sablonAd: string; olcu?: OzelOlcu }
export type CihazYazicilari = Partial<Record<SablonTuru, CihazYazicisi>>;

const ANAHTAR = 'coremes.etiket-merkezi.cihaz-yazicisi';

const gecerli = (x: unknown): x is CihazYazicisi => {
  if (typeof x !== 'object' || x === null) return false;
  const y = x as Record<string, unknown>;
  return Number.isInteger(y.yaziciId) && (y.yaziciId as number) > 0 && typeof y.yaziciAd === 'string'
    && typeof y.sablonAnahtar === 'string' && y.sablonAnahtar !== '' && typeof y.sablonAd === 'string'
    && (y.olcu === undefined || (typeof y.olcu === 'object' && y.olcu !== null && olcuCoz(String((y.olcu as Record<string, unknown>).genislik), String((y.olcu as Record<string, unknown>).yukseklik)).olcu !== null));
};

// Bozuk ya da eski biçimli kayıt yok sayılır: varsayılan yokmuş gibi Etiket Merkezi açılır.
export function cihazYazicilariniCoz(ham: string | null): CihazYazicilari {
  if (ham === null) return {};
  try {
    const v: unknown = JSON.parse(ham);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, y]) => gecerli(y))) as CihazYazicilari;
  } catch { return {}; }
}

export function cihazYazicilari(): CihazYazicilari {
  try { return cihazYazicilariniCoz(localStorage.getItem(ANAHTAR)); } catch { return {}; }
}

export const kayitYazicisi = (kayitTuru: KayitTuru, liste: CihazYazicilari = cihazYazicilari()): CihazYazicisi | null =>
  liste[kayitSablonTuru(kayitTuru)] ?? null;

// null varsayılanı kaldırır.
export function cihazYazicisiKaydet(tur: SablonTuru, y: CihazYazicisi | null): void {
  const liste = cihazYazicilari();
  if (y === null) delete liste[tur]; else liste[tur] = y;
  try { localStorage.setItem(ANAHTAR, JSON.stringify(liste)); } catch { /* depolama kapalı: varsayılan bu açılışta yok sayılır */ }
}
