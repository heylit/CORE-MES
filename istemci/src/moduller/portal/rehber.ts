import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/portal',
    ozet: 'Müşteri ve tedarikçilerle teklif, sipariş, fiyat, kalite, ödeme ve cari işleri.',
    nasil: [
      'Menüden bölüm seçin: Satış, Satın alma, Kalite, Finans, Yönetim grupları.',
      'Onay adımlarında "Onayla" ya da "Reddet"e basın.',
      '"Tahsilat kaydet", "Cari ekstre", "Belge ekle" ve CSV indirme düğmeleri ilgili ekranlardadır.',
    ],
    sinirlar: [
      'Görünen bölümler yetkinize göredir; yazmak portal yazma yetkisi ister.',
      'IBAN değişikliği her zaman muhasebe ve finans müdürü onayından geçer.',
    ],
    sozcukler: ['teklif', 'sipariş', 'fiyat listesi', 'cari', 'ekstre', 'iban'],
  },
];
