// Logo'dan dönen hata metni giden kutusuna ve belge sahibine yazılır; şoför kimlik numarası (TCKN, 11 hane) orada kalmasın (kart 3694, Risk notu).
// Kural geniştir: 11 ve daha uzun her rakam dizisi silinir; rakamlar arasındaki tek boşluk, nokta ya da tire dizi sayılır ("123 456 789 50", "123-456-789-50", "123.456.789.50"; 12 rakamlı IP de silinir, zararsız).
// Logo kayıt numaraları bu uzunluğa varmaz; iki nokta üst üste kıran saatli tarih (2026-11-25 09:00) 11 rakama ulaşmaz.
const UZUN_RAKAM = /\d(?:[ .-]?\d){10,}/g;
export const KIMLIK_YERINE = '[gizlendi]';

export function kimlikSuz(metin: string): string {
  return metin.replace(UZUN_RAKAM, KIMLIK_YERINE);
}
