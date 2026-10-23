import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/denetim',
    ozet: 'Sistemde kimin, ne zaman, hangi işlemi yaptığını gösteren salt okunur kayıt defteri.',
    nasil: [
      '"Kişi", "Başlangıç", "Bitiş" ve "İşlem" süzgeçlerini seçin; "Temizle" sıfırlar.',
      'Satıra tıklayın; yan pencerede ayrıntı açılır.',
      '"Görünüm"den "Değişiklikler"i seçin: üretim emri, iş emri, sipariş satırı, malzeme kartı, yetki ve ayar kayıtlarında hangi alanın neyden neye değiştiği listelenir.',
    ],
    sinirlar: [
      'Kayıt değiştirilemez ve silinemez.',
      'İçeriği ve eski/yeni değeri görmek ayrı yetki ister; parola ve PIN "[gizli]" görünür.',
    ],
    sozcukler: ['log', 'kayıt defteri', 'iz', 'kim yaptı', 'eski değer', 'değişiklik geçmişi'],
  },
];
