import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/denetim-hazirlik',
    ozet: 'ISO 9001, AS9100 ve EYDEP denetimine hazırlık: öz değerlendirme, haftalık program, bulgular, aksiyonlar, KYS, iç denetim ve takvim.',
    nasil: [
      'Üst sekmelerden bölüm seçin: Bugün, Denetimler, KYS, İç denetim, Kalibrasyon, Takvim, Performans, Ayarlar.',
      'Denetimlerde programı (ISO 9001, AS9100, EYDEP) ve sekmeyi seçin: Genel bakış, Değerlendirme, Hazırlık, Aksiyonlar, Rehber.',
      'Başlıktaki "Diğer işlemler" menüsündeki Yardım ya da ? tuşu açık bölümün kılavuzunu ve terimler sözlüğünü açar.',
      'Ctrl K ile bu sayfanın komutlarını çalıştırın; yazdıkça bölüm, soru, cihaz, doküman ve terim önerilir.',
    ],
    sinirlar: [
      'Kayıt girmek denetim hazırlığı yazma yetkisi ister; ilk kurulum, örnek firma ve silme işlemleri yalnız yöneticidedir.',
      'Ölçü aletleri Kalibrasyon sayfasında yönetilir; burada yalnız okunur.',
      'Aynı anda değişiklik olursa "Başka biri değiştirdi" uyarısı çıkar; son hâli okuyup yeniden girin.',
    ],
    sozcukler: ['iso', '9001', 'as9100', 'eydep', 'denetim', 'öz değerlendirme', 'bulgu', 'aksiyon', 'kys'],
  },
];
