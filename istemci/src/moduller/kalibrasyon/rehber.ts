import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/kalibrasyon',
    ozet: 'Ölçü aletlerinin kalibrasyon vadesini, sonucunu ve kullanım durumunu takip eder.',
    nasil: [
      'Aletler sekmesinde arama kutusuna alet no, tür, ad ya da yer yazın.',
      '"Alet ekle" ile yeni alet açın; isterseniz ilk kalibrasyon kaydını da ekleyin.',
      'Alete tıklayın, açılan pencerede "Kalibrasyon kaydet" ile tarih, sonuç ve sertifika no girin.',
      'Türler sekmesinde "Tür ekle" ile alet türü tanımlayın; "CSV" listeyi indirir.',
    ],
    sinirlar: [
      'Kayıt girmek kalibrasyon yazma yetkisi ister; görmek herkese açıktır.',
      'Kalibrasyon kaydı olan alet silinmez, kullanım dışı bırakılır. Uygunsuz sonuç aleti kullanım dışı yapar.',
      'İleri tarihli kayıt girilmez; vadeye 30 gün ya da daha az kalan alet "yaklaşan" sayılır.',
    ],
    sozcukler: ['kalibrasyon', 'ölçü aleti', 'mikrometre', 'kumpas', 'sertifika', 'vade'],
  },
];
