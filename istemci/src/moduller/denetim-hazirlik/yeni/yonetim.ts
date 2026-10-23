// 226 a: yıkıcı işlemler (profil sil, seçerek sıfırla, bütün profilleri sil, yedekten yükle) yalnız yöneticide görünür; sunucu da `yonet`
// ister. Yazma yetkisi yetmez.
export const yikiciIzinli = (yetki: { yonetici: boolean }): boolean => yetki.yonetici;
