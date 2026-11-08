// Gün aralığı: ayar değeri olarak "gg.aa.yyyy - gg.aa.yyyy" ya da tek gün "gg.aa.yyyy" yazılır; sunucu ve ekran aynı kuralla doğrular.
// Sonuç ISO gündür (yyyy-aa-gg): karşılaştırma metin sırasıyla yapılabilsin.

export interface TarihAraligi {
  bas: string;
  bit: string;
}

// Dini bayram en çok dört gündür; daha uzun aralık yazım hatasıdır (yanlış ay ya da yıl).
export const TARIH_ARALIGI_EN_COK_GUN = 7;

const GUN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function gunCoz(metin: string): string | null {
  const m = GUN.exec(metin.trim());
  if (m === null) return null;
  const [gun, ay, yil] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(yil, ay - 1, gun));
  if (t.getUTCFullYear() !== yil || t.getUTCMonth() !== ay - 1 || t.getUTCDate() !== gun) return null;
  return t.toISOString().slice(0, 10);
}

const gunFarki = (bas: string, bit: string): number => (Date.parse(bit) - Date.parse(bas)) / 864e5;

export function tarihAraliginiCoz(metin: string): { aralik: TarihAraligi | null; hata: string | null } {
  const yazi = metin.trim();
  if (yazi === '') return { aralik: null, hata: null };
  const parcalar = yazi.split(/\s*[-–]\s*/);
  if (parcalar.length > 2) return { aralik: null, hata: 'Tek gün ya da "gg.aa.yyyy - gg.aa.yyyy" biçiminde yazın.' };
  const bas = gunCoz(parcalar[0] ?? '');
  const bit = parcalar.length === 2 ? gunCoz(parcalar[1] ?? '') : bas;
  if (bas === null || bit === null) return { aralik: null, hata: 'Gün "gg.aa.yyyy" biçiminde olmalı, örneğin 20.03.2026.' };
  if (bit < bas) return { aralik: null, hata: 'Bitiş günü başlangıçtan önce olamaz.' };
  if (gunFarki(bas, bit) >= TARIH_ARALIGI_EN_COK_GUN) return { aralik: null, hata: `Aralık en çok ${String(TARIH_ARALIGI_EN_COK_GUN)} gün olabilir.` };
  return { aralik: { bas, bit }, hata: null };
}

export const tarihAraligiHatasi = (metin: string): string | null => tarihAraliginiCoz(metin).hata;
