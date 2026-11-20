import type { SablonDayanagi } from '#paylasilan/sozlesme/projeler.ts';

// Talaşlı imalatta üretimden önceki hazırlık için örnek şablon. Kayıt değildir: yeni şablon formunu doldurur, kişi düzenleyip kaydeder.
// Madde açık değilse satır proje başına bir kez açılır. Yapan ve kontrol eden boştur; roller kurumdan kuruma değişir.
export interface OrnekSatir {
  ad: string; asama: string; madde: string | null; dayanak: SablonDayanagi; gun: number; sureGun: number;
  onceki: number | null; adimlar: readonly string[]; kanitZorunlu: boolean;
}

export const ORNEK_SABLON_ADI = 'Talaşlı imalat hazırlığı (örnek)';

export const ORNEK_SABLON: readonly OrnekSatir[] = [
  {
    ad: 'Sipariş ve çizim gözden geçirme', asama: 'Mühendislik', madde: 'cizim', dayanak: 'baslangic', gun: 0, sureGun: 1, onceki: null, kanitZorunlu: false,
    adimlar: ['Çizim revizyonunu siparişle karşılaştır', 'Kritik ölçü ve toleransları işaretle', 'Yüzey ve ısıl işlem isteklerini not et', 'Belirsiz noktaları müşteriye sor'],
  },
  {
    ad: 'Proses ve rota planı', asama: 'Mühendislik', madde: null, dayanak: 'baslangic', gun: 1, sureGun: 2, onceki: 0, kanitZorunlu: false,
    adimlar: ['Operasyon sırasını belirle', 'Tezgah ve bağlama planını yaz', 'Çevrim sürelerini tahmin et', 'Rotayı yürürlüğe al'],
  },
  {
    ad: 'Malzeme ve sertifika', asama: 'Malzeme', madde: 'malzeme', dayanak: 'baslangic', gun: 1, sureGun: 3, onceki: 0, kanitZorunlu: true,
    adimlar: ['Malzeme kalitesi ve ölçüsünü doğrula', 'Malzeme sertifikasını ekle', 'Kesim ölçüsünü ve adedini hazırla'],
  },
  {
    ad: 'Takım ve tutucu hazırlığı', asama: 'Atölye', madde: 'takim-hazirla', dayanak: 'baslangic', gun: 2, sureGun: 2, onceki: 1, kanitZorunlu: false,
    adimlar: ['Takım listesini çıkar', 'Eksik takımı talep et', 'Takım ömürlerini kontrol et', 'Takımları ön ayar cihazında ölç'],
  },
  {
    ad: 'Fikstür ve bağlama aparatı', asama: 'Atölye', madde: 'aparat', dayanak: 'baslangic', gun: 2, sureGun: 2, onceki: 1, kanitZorunlu: false,
    adimlar: ['Aparatın hazır ve sağlam olduğunu kontrol et', 'Gerekirse aparat tasarımını iste', 'Bağlama referanslarını işaretle'],
  },
  {
    ad: 'CNC programı ve simülasyon', asama: 'Programlama', madde: 'cnc', dayanak: 'baslangic', gun: 3, sureGun: 2, onceki: 1, kanitZorunlu: false,
    adimlar: ['Programı yaz', 'Simülasyonda çarpışma kontrolü yap', 'Kesme değerlerini takım listesiyle eşle', 'Programı terminale gönder'],
  },
  {
    ad: 'Ölçü aletleri ve kontrol planı', asama: 'Kalite', madde: 'olcu-aleti', dayanak: 'baslangic', gun: 3, sureGun: 1, onceki: 0, kanitZorunlu: false,
    adimlar: ['Kontrol planını hazırla', 'Ölçü aletlerinin kalibrasyonunu kontrol et', 'Özel mastar gerekiyorsa iste'],
  },
  {
    ad: 'İlk parça onayı', asama: 'Kalite', madde: null, dayanak: 'baslangic', gun: 5, sureGun: 1, onceki: 5, kanitZorunlu: true,
    adimlar: ['İlk parçayı kontrol planına göre ölç', 'Ölçü raporunu ekle', 'Seri üretime onay ver'],
  },
];
