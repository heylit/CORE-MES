import type { KayitTuru, OzelOlcu, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { kayitSablonTuru } from './kayit-secimi.ts';
import { olcuCoz } from './ozel-olcu.ts';

// 2916 a: olay ekranındaki "etiket bas" bu cihazın varsayılan yazıcısına gider. Varsayılan cihaz başınadır: yazıcı fiziksel olarak
// cihazın yanındadır, kişi başka bilgisayara geçince oradakini seçer. Şablon türü başına bir yazıcı ve şablon tutulur (lot 100x50,
// konum 50x25 başka rulolardır). Yazıcının geçerliliğini sunucu her baskıda yeniden denetler; burada yalnız seçim saklanır.
// olcu: standart dışı rulo (şablonun tasarımı bu ölçüye orantılı basılır); yoksa şablonun kendi ölçüsü.
// baglanti: 'usb' dosya yazıcısının bu bilgisayarda eşleşmiş USB aygıtıdır (2953 c); yoksa ağ yazıcısıdır (eski kayıtlar ağdır).
export type CihazBaglantisi = 'ag' | 'usb';
export interface CihazYazicisi { yaziciId: number; yaziciAd: string; sablonAnahtar: string; sablonAd: string; olcu?: OzelOlcu; baglanti?: CihazBaglantisi }
export type CihazYazicilari = Partial<Record<SablonTuru, CihazYazicisi>>;

const ANAHTAR = 'coremes.etiket-merkezi.cihaz-yazicisi';

const gecerli = (x: unknown): x is CihazYazicisi => {
  if (typeof x !== 'object' || x === null) return false;
  const y = x as Record<string, unknown>;
  return Number.isInteger(y.yaziciId) && (y.yaziciId as number) > 0 && typeof y.yaziciAd === 'string'
    && typeof y.sablonAnahtar === 'string' && y.sablonAnahtar !== '' && typeof y.sablonAd === 'string'
    && (y.baglanti === undefined || y.baglanti === 'ag' || y.baglanti === 'usb')
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

// Etiket bas'ta son seçilen yazıcı (tür başına): varsayılan yapılmasa da bir sonraki açılışta seçili gelir.
const SON_ANAHTAR = 'coremes.etiket-merkezi.son-yazici';
export function sonYaziciOku(tur: SablonTuru): string | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SON_ANAHTAR) ?? '{}');
    const d = typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[tur] : undefined;
    return typeof d === 'string' && /^(ag|usb|dosya):[1-9][0-9]{0,9}$|^tarayici$/.test(d) ? d : null;
  } catch { return null; }
}
export function sonYaziciYaz(tur: SablonTuru, deger: string): void {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SON_ANAHTAR) ?? '{}');
    const liste = typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
    localStorage.setItem(SON_ANAHTAR, JSON.stringify({ ...liste, [tur]: deger }));
  } catch { /* depolama kapalı: seçim bu açılışta kalır */ }
}
