// profil.geri-bildirim-oku: çalışanların gönderdiği şikayet, istek ve önerileri yazanın adıyla okur. Gönderme ve kendi geçmişini
// görme işlem istemez (her oturum, yalnız kendi kaydı).
// profil.geri-bildirim-yanitla: Geri Bildirim Merkezi'nde kayda yanıt ve iç not yazar; durumu, kategoriyi, sorumluyu ve ana kaydı
// değiştirir (2192-1 a). profil.geri-bildirim-kategori-yaz: kategori ekler, adını değiştirir, pasife alır (2192-3 a).
export const PROFIL_ISLEMLERI = ['profil.geri-bildirim-oku', 'profil.geri-bildirim-yanitla', 'profil.geri-bildirim-kategori-yaz'] as const;
