import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/ik-islemlerim',
    ozet: 'Kendi izin, bordro ve mesai kayıtlarınızı görürsünüz; ekip yöneticisi izin taleplerini onaylar.',
    nasil: [
      'Sekmeler: "Benim sayfam", "İzinlerim", "Bordrolarım", "Mesailerim"; yöneticide ayrıca "Onaylar", "Ekip", "İzin takvimi".',
      'İzinlerim\'de "İzin talep et"e basın; bekleyen talebi "Talebi geri çek" ile geri alın.',
      'Bordrolarım\'da kesinleşen bordroyu "Gördüm, onaylıyorum" ile onaylayın.',
      'Benim sayfam\'da "İletişim bilgilerim" bölümünden iletişim bilgilerinizi güncelleyin.',
      'Onaylar\'da talebi "Onayla" ya da "Reddet".',
    ],
    sinirlar: [
      'Kimse kendi talebine karar veremez; reddedilen talep değişmez, yeni talep açılır.',
      'Bordro onayı bir kez verilir; ay yeniden kesinleşirse yeniden onaylanır.',
      'Ekip maddeleri izin onayı yetkisi olana görünür.',
    ],
    sozcukler: ['izin', 'bordro', 'maaş', 'mesai', 'rapor', 'yıllık izin', 'onay'],
  },
  {
    yol: '/ik',
    ozet: 'İK ekibinin personel, izin, devam, bordro, performans, eğitim ve işe alım yönetimi.',
    nasil: [
      'Sekmelerden bölüm seçin: Pano, Yapılacaklar, Personel, İzinler, Devam ve mesai, Bordro, Eğitim, Raporlar.',
      'Yapılacaklar bekleyen İK işlerini toplar; oradan ilgili kayda geçin.',
    ],
    sinirlar: [
      'Her bölümün kendi yazma yetkisi vardır; yetki yoksa ekran salt okunur açılır.',
      'Ücret ayrı yetkiyle değişir; kesinleşmiş ayı yeniden açmak ayrı yetki ister.',
      'Onaylanmış izin geri çevrilemez, yalnız iptal edilir.',
    ],
    sozcukler: ['personel', 'izin', 'bordro', 'performans', 'eğitim', 'işe alım', 'devam'],
  },
];
