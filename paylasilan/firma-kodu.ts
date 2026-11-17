// Kendi firmalarımızın kısa kodu (3399 a): Sistem Ayarları > Firma kodları'nda tutulur, kayıtlarda seçilir, numara kalıplarına
// {FIRMA} ile girer, firma kodlu malzeme türlerinde stok kodunun başı olur (ORNA-MM-00001). Tür kısaltması firma kodu olamaz:
// "HM-MM-00001" hammadde kodu gibi okunur. Sunucu, ekran ve veritabanı kısıtı aynı kuralı uygular.
export const FIRMA_KODU_DESENI = /^[A-Z0-9]{2,5}$/;
export const FIRMA_KODU_YASAK = ['HM', 'YM', 'MM', 'SF', 'DB', 'HZ', 'TM'] as const;
export const FIRMA_KODU_ILETISI = 'Firma kodu 2-5 büyük harf ya da rakam olmalı ve tür kısaltması (HM, YM, MM, SF, DB, HZ, TM) olamaz.';
export const FIRMA_ADI_EN_UZUN = 80;

export function firmaKoduGecerliMi(kod: unknown): kod is string {
  return typeof kod === 'string' && FIRMA_KODU_DESENI.test(kod) && !(FIRMA_KODU_YASAK as readonly string[]).includes(kod);
}
