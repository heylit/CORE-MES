import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/sevkiyat',
    ozet: 'Günlük sevkiyat işlerini araçlara dağıtır, rotayı hesaplar, planı onaylar ve sonucu kaydeder.',
    nasil: [
      '"Günlük sevkiyat"ta günü seçin, "Yeni iş" ile iş ekleyin.',
      '"Otomatik dağıt" ile işleri araçlara yerleştirin, sonra "Planı onayla".',
      'Yoldaki işi "Tamamlandı olarak kapat" ya da "Yapılamadı" ile kapatın.',
      'Tek seferlik güzergâh için "Rota hesapla"; nokta ve araçlar "Tanımlar"da.',
    ],
    sinirlar: [
      'İş girme, planlama, onaylama ve tanım düzenleme ayrı yetkilerdir.',
      'Onaylı planda yeni iş ve dağıtım kapalıdır; yoldaki ya da tamamlanmış iş değiştirilemez.',
      '"Yapılamadı" seçilen iş ertesi günün havuzuna geçer.',
    ],
    sozcukler: ['sevk', 'araç', 'şoför', 'teslimat', 'güzergah', 'rota'],
  },
];
