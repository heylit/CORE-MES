import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/denetim',
    ozet: 'Sistemde kimin, ne zaman, hangi işlemi yaptığını gösteren salt okunur kayıt defteri.',
    nasil: [
      '"Kişi", "Başlangıç", "Bitiş" ve "İşlem" süzgeçlerini seçin; "Temizle" sıfırlar.',
      'Satıra tıklayın; yan pencerede ayrıntı açılır.',
    ],
    sinirlar: [
      'Kayıt değiştirilemez ve silinemez.',
      'İçeriği görmek ayrı yetki ister; parola ve PIN deftere "[gizli]" yazılır.',
    ],
    sozcukler: ['log', 'kayıt defteri', 'iz', 'kim yaptı'],
  },
];
