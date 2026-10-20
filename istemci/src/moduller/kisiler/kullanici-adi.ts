const TURKCE: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

// Hesap açma penceresinin ilk değeri: sunucu kullanıcı adında yalnız a-z, rakam, nokta, tire ve alt çizgi kabul eder;
// Türkçe harf ve boşluk ad-soyaddan geldiği için en sık hata buydu. Kullanıcı öneriyi değiştirebilir; kural sunucudadır.
export function kullaniciAdiOner(ad: string): string {
  const oneri = ad
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (h) => TURKCE[h] ?? h)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40)
    .replace(/\.+$/, '');
  return oneri.length >= 3 ? oneri : '';
}
