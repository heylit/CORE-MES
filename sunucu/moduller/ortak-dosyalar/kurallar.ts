import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { KLASOR_DUZEYLERI } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { KlasorDuzeyi, VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';

// Kurallar ADR 0030'dandır; OD numaraları KURAL-TEST.md'de testine bağlanır.

export const ILETILER = {
  klasorYok: 'Klasör bulunamadı.',
  dosyaYok: 'Dosya bulunamadı.',
  surumYok: 'Sürüm bulunamadı.',
  yetkiYok: 'Bu klasörde bu işlem için yetkiniz yok.',
  kokYalnizYonetici: 'Üst düzey klasörü yalnız yönetici açar.',
  klasorAdiVar: 'Bu klasörde aynı adlı bir klasör var.',
  dosyaAdiVar: 'Bu klasörde aynı adlı etkin bir dosya var; önce onu arşive kaldırın ya da yeni sürüm yükleyin.',
  kokOzelOlmali: 'Üst düzey klasör yetkisini kendisi taşır; üst klasöre bağlanamaz.',
  yoneticiSatiri: 'Sistem Yöneticisi rolü her klasörü yönetir; satırı yazılmaz.',
  rolYok: 'Rol bulunamadı.',
  zatenArsivde: 'Dosya zaten arşivde.',
  arsivdeDegil: 'Dosya arşivde değil.',
  uzantiUyusmuyor: 'Dosya adının uzantısı içeriğiyle uyuşmuyor; dosyayı kendi uzantısıyla yükleyin.',
} as const;

// OD-1: düzeyler sıralıdır, üstteki alttakini içerir.
export const duzeySirasi = (d: KlasorDuzeyi): number => KLASOR_DUZEYLERI.indexOf(d);
export const enAzMi = (var_: KlasorDuzeyi, gereken: KlasorDuzeyi): boolean => duzeySirasi(var_) >= duzeySirasi(gereken);

export interface KlasorDugumu {
  id: number;
  ustId: number | null;
  ozelYetki: boolean;
}

export interface KisiRolu {
  id: number;
  yonetici: boolean;
}

// OD-2 (miras): özel yetkisi olmayan klasör, en yakın özel yetkili üst klasörün satırlarını kullanır. Döngü ya da kopuk zincir
// (veri bozuk) yetki vermez: null döner.
export function yetkiKaynagi(id: number, klasorler: ReadonlyMap<number, KlasorDugumu>): number | null {
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  while (k !== undefined && !gorulen.has(k.id)) {
    if (k.ozelYetki) return k.id;
    gorulen.add(k.id);
    k = k.ustId === null ? undefined : klasorler.get(k.ustId);
  }
  return null;
}

// OD-3: kişinin düzeyi rollerinin en yükseğidir; yönetici her klasörde `yonetir`. OD-4: bilinmeyen klasör `yok`.
export function duzeyCoz(
  id: number,
  klasorler: ReadonlyMap<number, KlasorDugumu>,
  yetkiler: ReadonlyMap<number, ReadonlyMap<number, VerilenDuzey>>,
  roller: readonly KisiRolu[],
): KlasorDuzeyi {
  if (!klasorler.has(id)) return 'yok';
  if (roller.some((r) => r.yonetici)) return 'yonetir';
  const kaynak = yetkiKaynagi(id, klasorler);
  if (kaynak === null) return 'yok';
  const satirlar = yetkiler.get(kaynak);
  let en: KlasorDuzeyi = 'yok';
  for (const r of roller) {
    const d = satirlar?.get(r.id);
    if (d !== undefined && duzeySirasi(d) > duzeySirasi(en)) en = d;
  }
  return en;
}

// OD-5 (görünmezlik): bir klasör, kendisi ve bütün üstleri en az `gorur` ise görünür. Üstü görünmeyen alt klasör ağaçta asılı
// kalmasın diye gizlenir (özel yetkiyle açılmış olsa da: ADR 0030, 5 klasörün varlığını sızdırmaz).
export function gorunurMu(id: number, klasorler: ReadonlyMap<number, KlasorDugumu>, duzey: (id: number) => KlasorDuzeyi): boolean {
  const gorulen = new Set<number>();
  let k = klasorler.get(id);
  if (k === undefined) return false;
  while (k !== undefined) {
    if (gorulen.has(k.id) || !enAzMi(duzey(k.id), 'gorur')) return false;
    gorulen.add(k.id);
    if (k.ustId === null) return true;
    k = klasorler.get(k.ustId);
  }
  return false;
}

// OD-6: ad tekilliği tr-TR, büyük-küçük harf duyarsız; Unicode biçimi birleştirilir (aynı görünen iki ad aynı anahtarı alır).
export const adAnahtari = (ad: string): string => ad.trim().normalize('NFC').toLocaleLowerCase('tr-TR');

// OD-7 (ADR 0030, 9): ortak klasörün kabul ettiği türler. Makrolu tür ve çalıştırılabilir dosya `dosya` modülünce tanınmaz, reddedilir.
export const ORTAK_DOSYA_TURLERI = [
  'pdf', 'png', 'jpeg', 'webp', 'docx', 'xlsx', 'pptx', 'txt', 'csv',
] as const satisfies readonly DosyaTuru[];
export type OrtakDosyaTuru = (typeof ORTAK_DOSYA_TURLERI)[number];

// OD-18: indirilen dosya yükleyenin verdiği adla kaydedilir; içerikle uyuşmayan uzantı (ör. `.bat` adlı düz metin) açılınca çalışabilir.
// Ad, içerikten bulunan türün uzantılarından biriyle bitmelidir (büyük-küçük harf duyarsız).
const UZANTILAR: Readonly<Record<OrtakDosyaTuru, readonly string[]>> = {
  pdf: ['pdf'], png: ['png'], jpeg: ['jpg', 'jpeg', 'jpe', 'jfif'], webp: ['webp'],
  docx: ['docx'], xlsx: ['xlsx'], pptx: ['pptx'], txt: ['txt', 'csv'], csv: ['csv', 'txt'],
};
const ortakTurMu = (tur: string): tur is OrtakDosyaTuru => (ORTAK_DOSYA_TURLERI as readonly string[]).includes(tur);

export function uzantiUyarMi(ad: string, tur: string): boolean {
  if (!ortakTurMu(tur)) return false;
  const nokta = ad.lastIndexOf('.');
  if (nokta <= 0 || nokta === ad.length - 1) return false;
  return UZANTILAR[tur].includes(ad.slice(nokta + 1).toLowerCase());
}
