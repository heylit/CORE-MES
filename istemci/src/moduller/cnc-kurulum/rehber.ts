import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/cnc-kurulum',
    ozet: 'CNC makine kurulumu, takım kütüphanesi, ham malzeme, G-kod simülasyonu ve takım ömrü çalışma alanı.',
    nasil: [
      'Üst gezinmeden bölüm seçin: Kurulum, Hazırlık, Kütüphane, Ham Malzeme, Oto-CAM, G-Kod Sim., Takım Ömrü.',
      'Kurulumda Model ve Magazin sekmeleriyle çalışın.',
      'Makine modellerini göndermek için "Çizim Merkezi\'ne aktar" sekmesinde makineleri işaretleyip "aktar"a basın.',
    ],
    sinirlar: [
      'Kaydetmek CNC kurulum yazma yetkisi ister; aktarım yalnız Çizim Merkezi\'ne yazabilene açıktır.',
      'Başkası aynı kaydı değiştirdiyse kayıt yazılmaz; sayfayı yenileyin.',
    ],
    sozcukler: ['takım', 'g-kod', 'simülasyon', 'magazin', 'cam'],
  },
];
