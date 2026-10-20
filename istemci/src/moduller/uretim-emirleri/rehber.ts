import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/uretim-emirleri',
    ozet: 'Açık ve biten üretim emirlerini izlersiniz; emir burada açılmaz ve düzenlenmez.',
    nasil: [
      '"Açık emirler" ya da "Bitenler" sekmesini seçin, "Durum" listesiyle süzün.',
      'Satıra ya da emir numarasına basın; emrin ayrıntısı açılır.',
      'Ayrıntıda "Refakat kartı bas" ile etiketi yazdırın (QR kodda emir var).',
      'Biten emirde "Stoka tamamla" ile ürünü stoğa alın; eksik varsa "Eksikleri teslim al".',
      'Yeni emir için "Reçete ve Rota\'da emir aç" düğmesini kullanın.',
    ],
    sinirlar: [
      'Emir yalnız Reçete ve Rota\'da açılır, düzenlenir ve iptal edilir.',
      '"Stoka tamamla" yalnız bitmiş emirde ve stok giriş-çıkış yetkisi olana görünür; iki adımda onay ister.',
    ],
    sozcukler: ['emir', 'iş emri', 'refakat', 'etiket', 'tamamla'],
  },
];
