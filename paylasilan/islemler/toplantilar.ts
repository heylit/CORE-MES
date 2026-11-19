// 3448-2 a: düzenleyen ve katılımcı kendi toplantısını işlem istemeden görür (Toplantılarım, yalnız oturum).
// toplantilar.oku: bütün toplantılar (Toplantılar sayfası). toplantilar.yaz: toplantı açma, değiştirme, iptal, karar ve aksiyon yazma.
// Rol dağılımı kullanıcı onayıyla girer; şimdilik yalnız yöneticidedir (bayraklı rol kayıtlı her işlemi alır).
export const TOPLANTILAR_ISLEMLERI = ['toplantilar.oku', 'toplantilar.yaz'] as const;
