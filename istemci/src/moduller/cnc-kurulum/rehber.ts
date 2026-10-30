import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/cnc-kurulum',
    ozet: 'CNC makine kurulumu, takım kütüphanesi, ham malzeme, G-kod simülasyonu ve takım ömrü çalışma alanı.',
    nasil: [
      'Üst sekmelerden bölüm seçin: Ana Sayfa, Kurulum, Hazırlık, Kütüphane, Ham Malzeme, Oto-CAM, G-Kod Sim., Takım Ömrü.',
      'Kütüphanede "Tezgâhlara göre" her makinenin ceplerindeki takımları, "Elimizdekiler" stoktaki takımları gösterir.',
      'Sahne 3D ya da 2B çizilir; seçim bu bilgisayarda hatırlanır.',
      'Makine modellerini Çizim Merkezi\'ne göndermek için Çizim Merkezi > CNC makineleri sayfasında makineleri işaretleyip "aktar"a basın.',
    ],
    sinirlar: [
      'Kaydetmek CNC kurulum yazma yetkisi ister; aktarım yalnız Çizim Merkezi\'ne yazabilene açıktır.',
      'Başkası aynı kaydı değiştirdiyse kayıt yazılmaz; sayfayı yenileyin.',
    ],
    sozcukler: ['takım', 'g-kod', 'simülasyon', 'magazin', 'cam'],
  },
];
