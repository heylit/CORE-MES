import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/malzemeler',
    ozet: 'Her malzeme ve hizmet için tek kart tutar; kartlar aranır, açılır, onaylanır ve etiketlenir.',
    nasil: [
      '"Katalog"da malzemeyi yazdığınız gibi arayın; kart varsa onu kullanın.',
      'Kart yoksa "Yeni kart"a basın; bilgileri kontrol edip kaydedin, kart onaya gider.',
      'Değişiklik için "Düzenle"; tekrar açılmış kart için "Birleştir", kullanılmayan kart için "Pasife al".',
      'Ayrıntılı anlatım sayfanın "Kılavuz" sekmesindedir.',
    ],
    sinirlar: [
      'Kart açmak ve onaylamak ayrı yetkilerdir; gönderen kendi kartını onaylayamaz.',
      'Kart silinmez, pasife alınır; kod hiç değişmez.',
    ],
    sozcukler: ['malzeme', 'hizmet', 'kart', 'katalog', 'hammadde', 'kod'],
  },
];
