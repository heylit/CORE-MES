import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/oee',
    ozet: 'Makine, istasyon ve iş merkezi verimini (OEE, TEEP, kullanılabilirlik, performans, kalite) gösterir.',
    nasil: [
      'Dönem seçin: "Dün", "Son 7 gün", "Bu ay" ya da "Tarih seç".',
      'Sekmelerden "İş merkezleri" ya da "Makineler"e geçin.',
      'Özet kartlarını ve tabloları okuyun; performans %120\'yi aşarsa veriyi kontrol edin.',
    ],
    sinirlar: [
      'Yalnız okur; yalnız yetkili olduğunuz iş merkezlerinin makinelerini görürsünüz.',
      'Birim maliyet ve tutarlar yalnız maliyet görme yetkisi olana görünür.',
      'OEE planlı süreye, TEEP takvimin bütün saatlerine göre hesaplanır.',
      'Vardiya dışında (mola, planlı duruş dahil) yapılan çalışma ve üretim OEE\'ye girmez; "Vardiya dışı" sütununda ayrı görünür.',
      'Kalite reddi edilen parça hurda gibi kalite kaybı sayılır.',
    ],
    sozcukler: ['verim', 'verimlilik', 'kullanılabilirlik', 'performans'],
  },
];
