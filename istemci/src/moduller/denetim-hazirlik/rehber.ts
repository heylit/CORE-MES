import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/denetim-hazirlik',
    ozet: 'ISO 9001 denetimine hazırlık: öz değerlendirme, haftalık program, bulgular ve aksiyonlar.',
    nasil: [
      'Üst gezinmeden bölüm seçin: Bugün, Denetimler, Yönetim sistemi.',
      'Bir denetimin içinde sekmeleri kullanın: Genel bakış, Değerlendirme, Hazırlık, Aksiyonlar, Rehber.',
      'Ekrandaki "Yardım" düğmesi bu sayfanın kendi kılavuzunu açar.',
    ],
    sinirlar: [
      'Kayıt girmek denetim hazırlığı yazma yetkisi ister; ilk kurulum ayrı yetkidir.',
      'Aynı anda değişiklik olursa "sayfayı yenileyin" uyarısı çıkar; ek dosya en çok 700 KB olabilir.',
    ],
    sozcukler: ['iso', '9001', 'denetim', 'öz değerlendirme', 'bulgu', 'aksiyon'],
  },
];
