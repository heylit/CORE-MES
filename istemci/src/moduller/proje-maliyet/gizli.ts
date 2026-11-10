// 2661 a (Arayüz 2663 K1): "Gizli" yazısı null'dan değil sunucunun gizli işaretinden gelir; bilinmeyen (—) ile karışmaz.
export const GIZLI = 'Gizli';
export const GIZLI_ACIKLAMA = 'Bu ayın genel gider oranı az kişili personel bileşeni içerdiği için genel gider payı ve toplamlar gösterilmez; hesapta kullanılır.';
export const GIZLI_BIRIKIM = 'Genel gider oranı gizli; birikim gösterilmez.';
export const GIZLI_SAPMA = 'Genel gider oranı gizli; iş emri sapmaları gösterilmez.';
export const GIZLI_KIRILIM = 'Genel gider gizli; grafikte yok.';

export function gizliVeyaDeger(metin: string, gizli: boolean): string {
  return gizli ? GIZLI : metin;
}
