// parola-degistir başkasının parolasıdır; kişinin kendi parolası işlem istemez.
// oturum-kapat başkasının bütün oturumlarıdır; kişinin kendi oturumları işlem istemez.
export const KISILER_ISLEMLERI = ['kisiler.oku', 'kisiler.yaz', 'kisiler.rol-yonet', 'kisiler.parola-degistir', 'kisiler.oturum-kapat'] as const;
