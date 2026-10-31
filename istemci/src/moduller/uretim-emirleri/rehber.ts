import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/uretim-emirleri',
    ozet: 'Açık ve biten üretim emirlerini izlersiniz; emir burada açılmaz ve düzenlenmez.',
    nasil: [
      '"Açık emirler" ya da "Bitenler" sekmesini seçin, "Durum" listesiyle süzün.',
      'Satıra ya da emir numarasına basın; emrin ayrıntısı açılır.',
      'Ayrıntıdaki "Refakat kartları" bölümünde depoda lotla açılan kartları görün; "Etiket Merkezi\'nde bas" ile kartı basın.',
      'Biten emirde sarfı ve çıktıyı görün; eksik varsa "Eksikleri teslim al". Stoğa işleme Reçete ve Rota\'daki emirdedir.',
      'Yeni emir için "Reçete ve Rota\'da emir aç" düğmesini kullanın.',
    ],
    sinirlar: [
      'Bu sayfa salt okumadır: emir, üretim yeri, stoğa işleme ve kapanış onayı Reçete ve Rota\'dadır.',
      'Refakat kartı depoda açılır (lot emre ayrılınca); burada yalnız görülür ve basılır. Bölüm stok okuması olana görünür.',
    ],
    sozcukler: ['emir', 'iş emri', 'refakat', 'etiket', 'tamamla'],
  },
];
