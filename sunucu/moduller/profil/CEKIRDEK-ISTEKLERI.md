# Çekirdek istekleri: profil

1. Oturum: kişinin kendi PIN'ini değiştirdiği uç. Öneri imza: `POST /hesabim/pin-degistir` `{ parola: string, yeniPin: string }` -> `{ tamam: true }`;
   `yetki: 'oturum'`, giriş beklemesi (ADR 0003 m.7) parola denetiminde de geçerli, `yeniPinHatasi` kuralı. Profil "Hesap ve güvenlik" kartı bunu çağıracak.
2. Rol x işlem (kullanıcı onayıyla): `profil.geri-bildirim-oku` -> öneri `mudur`, `insan_kaynaklari`.
