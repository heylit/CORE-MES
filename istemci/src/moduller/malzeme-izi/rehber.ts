import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/malzeme-izi',
    ozet: 'Bir malzemenin stoktaki hâlini, açık siparişlerini, fiyatlarını ve son partilerinin kalite durumunu tek ekranda gösterir.',
    nasil: [
      '"Kod ya da ad ara" kutusuna yazıp malzemeyi seçin.',
      'Üstteki kutular stoktaki dağılımı ve siparişte gelen miktarı gösterir.',
      '"Stok" ve "Malzeme kartı" düğmeleri işlemi sahibinin ekranında açar.',
    ],
    sinirlar: [
      'Yalnız okur; burada kayıt değişmez.',
      'Fiyatlar finans yetkisiyle görünür.',
    ],
    sozcukler: ['malzeme', '360', 'stok', 'lot', 'fiyat', 'sipariş'],
  },
];
