/* Sunucuya bağlı Arkon'da yetkiler TMI'nin rol x işlem matrisinden gelir; sunucu kv/perms yazımını reddeder (kart #215).
   Yetki ekranı bu kipte salt okunur gösterilir, kaydet her seferinde reddedilmesin (kullanıcı kararı 106 a). */
export const YETKI_KILIDI = "Yetkiler TMI'de Roller sayfasından değiştirilir.";

export const yetkilerTmide = (mod: 'server' | 'local'): boolean => mod === 'server';
