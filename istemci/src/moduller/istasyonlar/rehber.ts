import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/istasyonlar',
    ozet: 'İş merkezlerini, istasyonları, makineleri, personel atamalarını ve operasyon tiplerini tanımlar.',
    nasil: [
      'Sekmelerden bölümü seçin: Genel bakış, İş merkezleri ve istasyonlar, Makineler, Personel, Operasyon tipleri.',
      '"İş merkezi" düğmesiyle merkez ekleyin; merkezi açıp "İstasyon" ya da "Çoklu ekle" ile istasyon ekleyin.',
      'Makineler bölümünde "Makine" ile ekleyin; seçtiklerinizi toplu "Pasife al" ya da "Aktif yap".',
      'Personel bölümünde kişiyi istasyona "Ata" ile bağlayın.',
    ],
    sinirlar: [
      'Ekleme ve düzenleme istasyon yazma yetkisi ister.',
      'Kullanımdaki kayıt silinmez, pasife alınır; pasif kişi istasyona atanamaz.',
      'Kişinin iş merkezi kısıtı boşsa her iş merkezinde çalışabilir.',
    ],
    sozcukler: ['makine', 'tezgah', 'iş merkezi', 'atama', 'operasyon tipi'],
  },
];
