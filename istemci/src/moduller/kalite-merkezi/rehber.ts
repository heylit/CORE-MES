import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/kalite-merkezi',
    ozet: 'Muayene, uygunsuzluk (NCR), DÖF / 8D, ölçüm analizi ve kalite belgelerinin tek merkezi.',
    nasil: [
      'Başlığın altındaki sekmelerden bölümü seçin: Bugün, Parçalar, Muayeneler, Uygunsuzluklar (NCR), DÖF / 8D, Raporlar.',
      'Giriş, ara ve son kontrol kaydını Muayeneler bölümünde girin.',
      'Uygunsuz parça çıktıysa Uygunsuzluklar (NCR) bölümünden kayıt açın; düzeltici faaliyet için DÖF / 8D.',
    ],
    sinirlar: [
      'Görmek kalite okuma, kayıt girmek kalite yazma yetkisi ister; yedekten geri yükleme ayrı yetkidir.',
      'Değişiklik izi kayıtları değiştirilemez ve silinemez.',
      'Bir dosya en çok 50 MB olabilir; uygunsuzluk yalnız durumu "Kapalı" olunca kapanır.',
    ],
    sozcukler: ['kalite', 'muayene', 'ncr', 'döf', '8d', 'uygunsuzluk', 'aql', 'ölçüm'],
  },
];
