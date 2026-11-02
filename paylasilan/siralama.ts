// Türkçe alfabe sırası (c < ç < d, ı < i, o < ö, s < ş, u < ü). Kod sırası ('Ç' 'Z'den sonra) ve dil ayarına bağlı
// `localeCompare()` (sunucu ve tarayıcıda farklı) kullanılmaz. Sayılar değerine göre dizilir: "ORN-2" "ORN-10"dan önce.
// SQL karşılığı `ORDER BY <sütun> COLLATE public.tr` (göç 20261101221100); veritabanı C.UTF-8 olduğu için harmanlama yazılmadan
// ORDER BY kod sırasıyla dizer.
const HARMANLAYICI = new Intl.Collator('tr', { numeric: true });

export const turkceKarsilastir = (a: string, b: string): number => HARMANLAYICI.compare(a, b);

// Boş değer (null) sona gider; sıra bilinmeyen kayıt başa çıkmaz.
export function turkceSirala<T>(dizi: readonly T[], anahtar: (oge: T) => string | null | undefined): T[] {
  return [...dizi].sort((x, y) => {
    const a = anahtar(x);
    const b = anahtar(y);
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
    if (b === null || b === undefined) return -1;
    return HARMANLAYICI.compare(a, b);
  });
}
