import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/denetim',
    ozet: 'Sistemde kimin, ne zaman, hangi işlemi yaptığını gösteren salt okunur kayıt defteri.',
    nasil: [
      '"Kişi", "Başlangıç", "Bitiş", "Modül" ve "Komut" süzgeçlerini seçin; "Temizle" sıfırlar.',
      'Listede işlem yetki adıyla, kayıt adıyla görünür (ör. "Üretim emri 41"); teknik komut satır ayrıntısındadır.',
      'Satıra tıklayın; yan pencerede ayrıntı açılır.',
      'Kayıt ekranındaki "Geçmiş" düğmesi bu sayfayı o kaydın değişiklikleriyle açar; "Bütün değişiklikler" süzgeci kaldırır.',
      '"Görünüm"den "Değişiklikler"i seçin: üretim emri, iş emri, sipariş satırı, malzeme kartı, firma, rota, iş merkezi, istasyon, makine, kişi kartı, stok ayarı ve konumu, yetki ve ayar kayıtlarında hangi alanın neyden neye değiştiği listelenir.',
    ],
    sinirlar: [
      'Kayıt değiştirilemez ve silinemez.',
      '8 Ekim 2026 öncesi satırlarda modül ve işlem adı yoktur; komut gösterilir.',
      'İçeriği ve eski/yeni değeri görmek ayrı yetki ister; parola ve PIN "[gizli]" görünür.',
    ],
    sozcukler: ['log', 'kayıt defteri', 'iz', 'kim yaptı', 'eski değer', 'değişiklik geçmişi'],
  },
];
