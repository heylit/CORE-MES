import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/personel',
    ozet: 'Çalışan kayıtları, giriş hesapları, parola, PIN ve roller burada yönetilir.',
    nasil: [
      '"Kişi ekle" ile ad, sicil no ve görevi girin.',
      'Satırdaki simgelerle düzenleyin, pasife alın, hesap açın, parola değiştirin ya da PIN verin.',
      '"Roller" penceresinde rol atayın ya da kaldırın.',
      'Yetkiliyseniz "Yetki matrisi" sekmesinde rol ve işlem eşleşmelerini görürsünüz.',
    ],
    sinirlar: [
      'Kayıt, rol ve başkasının parolası ayrı yetkiler ister; herkes kendi parolasını değiştirebilir.',
      'Kendinizi pasife alamaz, kendinize rol atayamaz, kendinize PIN veremezsiniz.',
      'Tüm yetkileri veren rolde en az bir aktif kişi kalmalıdır.',
    ],
    sozcukler: ['kişi', 'çalışan', 'parola', 'şifre', 'pin', 'rol', 'yetki', 'hesap'],
  },
];
