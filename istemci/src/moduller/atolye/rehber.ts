import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/atolye',
    ozet: 'Fabrikanın haritasında makineleri, canlı durumlarını, depoyu ve parçaları gösterir.',
    nasil: [
      'Sekme seçin: Harita, Depo, Parçalar; üst listeden bölümü seçin.',
      '"Ara" kutusuna makine adını ya da kodunu yazıp sonuca basın.',
      'Sol araç çubuğuyla görünümü değiştirin: "Tüm fabrika", "Kuşbakışı", "Yürüyerek gez", "Depoya git".',
      '"Otomatik tur" sorunlu istasyondan başlayarak makineleri sırayla gezer.',
    ],
    sinirlar: [
      'Bölüm eklemek ve yerleşimi düzenlemek yerleşim yazma yetkisi ister.',
      'Haritaya yerleşmemiş makinenin canlı durumu görünmez.',
    ],
    sozcukler: ['harita', 'makine', 'tezgah', 'yerleşim', 'raf', 'depo'],
  },
];
