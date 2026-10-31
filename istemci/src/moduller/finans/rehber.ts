import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/finans',
    ozet: 'Satış, alış, tahsilat, ödeme, çek-senet, nakit planı, bütçe ve finans raporları.',
    nasil: [
      'Başlıktaki "Kayıt gir" düğmesiyle ya da N tuşuyla olayı seçin: "Satış yaptım", "Müşteriden para geldi", "Tedarikçiye ödeme yaptım", çek alma ve verme.',
      'Ctrl K ile olay, bölüm ya da firma arayın; firmanın tahsilatını ya da ödemesini oradan da girebilirsiniz.',
      'Çek ve senet bölümünde durumu güncelleyin: "Tahsil edildi", "Ödendi".',
      'Plan ve Raporlar sekmelerinde nakit planı, bütçe, gelir tablosu ve ay sonu kapanışı vardır; başlıktaki sağlık skoru Durum ve öneriler\'e götürür.',
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
