import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/recete-rota',
    ozet: 'Ürün reçetelerini, rotaları, süreleri ve kaynakları tanımlar; üretim emirlerini açar ve planlar.',
    nasil: [
      '"Ürün ve rotalar"da "+ Yeni rota" ile ürünü seçin; adımları "+ Adım ekle" ile ekleyin. Ürün ve malzeme kartı Malzemeler ve Hizmetler\'de açılır.',
      'Değişiklik için "Taslak aç", sonra "Onaya gönder"; "Onayla" ile yürürlüğe girer.',
      '"Üretim emri oluştur" ile emir açın; "Plana al" ile planlayıp "Kanban"da izleyin.',
    ],
    sinirlar: [
      'Kaydetmek reçete ve rota yazma yetkisi ister; yetkisi olmayanın değişikliği kaydedilmez.',
      'Onaylanan revizyon yürürlüğe girer, önceki arşivlenir.',
      'Başkası aynı kaydı değiştirdiyse üstüne yazılmaz.',
    ],
    sozcukler: ['reçete', 'rota', 'operasyon', 'süre', 'üretim emri aç', 'plan', 'kanban', 'emir aç'],
  },
];
