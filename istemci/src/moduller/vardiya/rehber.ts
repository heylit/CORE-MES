import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/vardiya',
    ozet: 'Vardiya saatleri, tatiller, kimin hangi vardiyada olduğu, fazla mesai ve planlı duruşlar.',
    nasil: [
      '"Vardiyalar ve tatiller"de gün ve vardiyayı seçip saatleri düzenleyin; "Resmî tatilleri ekle" ile tatilleri girin.',
      '"Vardiya başına personel"de kişileri seçip vardiyayı belirleyin, "Uygula"ya basın.',
      '"Fazla mesai"de "Fazla mesai ekle" ile kayıt açın.',
      '"Planlı duruşlar"da bakım gibi planlı duruşları girin; kapasiteden düşülür.',
      '"Günlük mesai"de o gün mesaide olanları görün.',
    ],
    sinirlar: [
      'Düzenleme vardiya yetkisi, planlı duruş girme ayrı yetki ister.',
      'Geçmiş tarihli takvim değişikliği yalnız geçmişi düzeltme yetkisiyle yapılır.',
      'Bayramlar her yıl elle eklenir.',
    ],
    sozcukler: ['vardiya', 'mesai', 'fazla mesai', 'tatil', 'bayram', 'planlı duruş', 'takvim'],
  },
];
