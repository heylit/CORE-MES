import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/finans',
    ozet: 'Satış, alış, tahsilat, ödeme, çek-senet, nakit planı, bütçe ve finans raporları.',
    nasil: [
      'Ana sayfada "Kayıt gir" ile olayı seçin: "Satış gir", "Tahsilat gir", "Ödeme gir", "Çek aldım", "Çek verdim".',
      'Çek ve senet bölümünde durumu güncelleyin: "Tahsil edildi", "Ödendi".',
      'Plan ve Raporlar sekmelerinde nakit planı, bütçe, gelir tablosu ve ay sonu kapanışı vardır.',
      'Listeleri "Excel\'e aktar" ya da "Yazdır / PDF" ile alın.',
    ],
    sinirlar: [
      'Kayıt girmek finans yazma; iptal ve geri alma finans yönetme yetkisi ister.',
      'Kapanmış ya da Logo\'dan gelen belgenin tutarı değişmez.',
      'Açık kaydı olan firma pasife alınamaz.',
    ],
    sozcukler: ['fatura', 'tahsilat', 'ödeme', 'çek', 'senet', 'nakit', 'bütçe', 'muhasebe', 'masraf'],
  },
];
