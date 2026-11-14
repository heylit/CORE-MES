import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { Taslak } from './durum.ts';

// Föydeki çizim rafı (3242 d): yeni kart kaydedilmeden STEP ve PDF seçilir, kart kaydedilince Çizim Merkezi'ne gider ve karta
// bağlanır. Dosyalar yalnız bu pencerede durur (taslakla saklanmaz): sayfa yenilenirse yeniden seçilir.

export type CizimTuru = 'teknik-resim' | '3b-model';
export type CizimDurumu = 'bekler' | 'gidiyor' | 'yayinda' | 'taslak' | 'hata';

export interface BekleyenCizim {
  anahtar: string;
  dosya: File;
  tur: CizimTuru;
  durum: CizimDurumu;
  oran: number;
  hata: string | null;
  belgeId: number | null;
}

// Kullanıcının istediği iki biçim: teknik resim PDF, 3B model STEP. Öteki biçimler kayıttan sonra "Resimler"den eklenir.
export function cizimTuru(ad: string): CizimTuru | null {
  const uzanti = ad.toLowerCase().split('.').pop() ?? '';
  if (uzanti === 'pdf') return 'teknik-resim';
  if (uzanti === 'step' || uzanti === 'stp') return '3b-model';
  return null;
}

export const CIZIM_KABULU = '.pdf,.step,.stp';

// Raf yalnız teknik resim no'su olan türlerde (yarı mamul, mamul) çıkar: dosya o numarayla gider.
export function rafVar(d: Taslak, b: KuralBaglami): boolean {
  if (!K.isGen(d, b)) return false;
  return K.turAdimlari(d, b).some((a) => a.alanlar?.some((x) => x.k === 'resim'));
}

const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

// Dosyanın gideceği teknik resim no ve revizyon: kartın o anki alanları (taşıma anında okunur, değişirse rafta da değişir).
export function cizimHedefi(d: Taslak): { resimNo: string | null; rev: string | null } {
  return { resimNo: metin(d.g.resim), rev: metin(d.g.rev) };
}

// Aynı ad ve boyutta dosya iki kez eklenmez; desteklenmeyen biçim adıyla döner.
export function cizimEkle(liste: readonly BekleyenCizim[], dosyalar: readonly File[]): { liste: BekleyenCizim[]; reddedilen: string[] } {
  const yeni = [...liste];
  const reddedilen: string[] = [];
  for (const dosya of dosyalar) {
    const tur = cizimTuru(dosya.name);
    if (!tur) { reddedilen.push(dosya.name); continue; }
    const anahtar = `${dosya.name}|${String(dosya.size)}`;
    if (yeni.some((c) => c.anahtar === anahtar)) continue;
    yeni.push({ anahtar, dosya, tur, durum: 'bekler', oran: 0, hata: null, belgeId: null });
  }
  return { liste: yeni, reddedilen };
}

// Uzun adı uzantısı görünecek biçimde ortadan kısaltır (dar karede "…_Rev-B.step" okunur).
export function ortadanKisalt(ad: string, azami = 28): string {
  if (ad.length <= azami) return ad;
  const nokta = ad.lastIndexOf('.');
  const son = nokta > 0 ? ad.slice(Math.max(nokta - 6, 0)) : ad.slice(-8);
  return `${ad.slice(0, Math.max(azami - son.length - 1, 4))}…${son}`;
}
