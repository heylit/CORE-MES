import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/durus-nedenleri',
    ozet: 'Operatörün seçeceği duruş ve hurda nedeni listesini tanımlar.',
    nasil: [
      '"Duruş nedenleri" ya da "Hurda nedenleri" sekmesini seçin.',
      '"Yeni duruş nedeni" ya da "Yeni hurda nedeni" düğmesine basın; kod, ad, kategori ve simgeyi girip "Kaydet".',
      'Düzenlemek için listedeki satıra tıklayın.',
      'Nedeni operatör listesinden kaldırmak için "Aktif" kutusunun işaretini kaldırın.',
    ],
    sinirlar: [
      'Yazmak duruş nedenleri yazma yetkisi ister; görmek herkese açıktır.',
      'Planlı nedene çağrı tanımlanmaz; çağrı ekibi ile gecikme birlikte girilir.',
    ],
    sozcukler: ['duruş', 'hurda', 'neden', 'arıza'],
  },
];
