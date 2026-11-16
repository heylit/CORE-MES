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
  // Başka grubun alanına bırakılıp kendi grubuna geçen dosya; bir sonraki eklemeye kadar vurgulanır (3305).
  tasindi: boolean;
}

// Kullanıcının istediği iki biçim: teknik resim PDF, 3B model STEP. Öteki biçimler kayıttan sonra "Resimler"den eklenir.
export function cizimTuru(ad: string): CizimTuru | null {
  const uzanti = ad.toLowerCase().split('.').pop() ?? '';
  if (uzanti === 'pdf') return 'teknik-resim';
  if (uzanti === 'step' || uzanti === 'stp') return '3b-model';
  return null;
}

export const CIZIM_KABULU = '.pdf,.step,.stp';

// Raf iki gruba ayrılır (3305 a): kullanıcı türü grup başlığından okur; dosyanın türü yine uzantıdan gelir (`cizimTuru`). Sıra Resimler paneliyle aynıdır.
export interface CizimGrubu { tur: CizimTuru; ad: string; cumlede: string; bicim: string; kabul: string; birak: string; simge: 'cube' | 'ruler' }
export const CIZIM_GRUPLARI: readonly CizimGrubu[] = [
  { tur: '3b-model', ad: '3B model', cumlede: '3B model', bicim: 'STEP, STP', kabul: '.step,.stp', birak: 'STEP bırak', simge: 'cube' },
  { tur: 'teknik-resim', ad: 'Teknik resim', cumlede: 'teknik resim', bicim: 'PDF', kabul: '.pdf', birak: 'PDF bırak', simge: 'ruler' },
];

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

// Aynı ad ve boyutta dosya iki kez eklenmez; desteklenmeyen biçim adıyla döner. Tür her zaman uzantıdan gelir: başka grubun
// alanına bırakılan dosya kendi grubuna geçer ve `tasinan`da adıyla döner.
export function cizimEkle(
  liste: readonly BekleyenCizim[], dosyalar: readonly File[], hedef?: CizimTuru,
): { liste: BekleyenCizim[]; reddedilen: string[]; tasinan: string[] } {
  const yeni = liste.map((c) => (c.tasindi ? { ...c, tasindi: false } : c));
  const reddedilen: string[] = [];
  const tasinan: string[] = [];
  for (const dosya of dosyalar) {
    const tur = cizimTuru(dosya.name);
    if (!tur) { reddedilen.push(dosya.name); continue; }
    const anahtar = `${dosya.name}|${String(dosya.size)}`;
    if (yeni.some((c) => c.anahtar === anahtar)) continue;
    const tasindi = hedef !== undefined && hedef !== tur;
    if (tasindi) tasinan.push(dosya.name);
    yeni.push({ anahtar, dosya, tur, durum: 'bekler', oran: 0, hata: null, belgeId: null, tasindi });
  }
  return { liste: yeni, reddedilen, tasinan };
}

// Taşınan dosyaların bilgi iletisi: tek dosyada adıyla, çokta sayıyla.
export function tasimaIletisi(tasinan: readonly string[], liste: readonly BekleyenCizim[]): string | null {
  if (tasinan.length === 0) return null;
  const ad = tasinan[0]!;
  const grup = CIZIM_GRUPLARI.find((g) => g.tur === liste.find((c) => c.dosya.name === ad)?.tur);
  if (tasinan.length === 1 && grup) return `${ad} ${grup.cumlede} olarak alındı.`;
  return `${String(tasinan.length)} dosya kendi grubuna alındı.`;
}

// Uzun adı uzantısı görünecek biçimde ortadan kısaltır (dar karede "…_Rev-B.step" okunur).
export function ortadanKisalt(ad: string, azami = 28): string {
  if (ad.length <= azami) return ad;
  const nokta = ad.lastIndexOf('.');
  const son = nokta > 0 ? ad.slice(Math.max(nokta - 6, 0)) : ad.slice(-8);
  return `${ad.slice(0, Math.max(azami - son.length - 1, 4))}…${son}`;
}
