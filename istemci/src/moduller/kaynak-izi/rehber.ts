import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/kaynak-izi',
    ozet: 'Bir istasyonun, makinenin ya da kişinin üretimdeki yüzünü tek ekranda gösterir: atama, yetkinlik, durum, vardiya, izin, işler, OEE ve saat maliyeti.',
    nasil: [
      '"Kod ya da ad ara" kutusuna yazıp istasyon, makine ya da kişiyi seçin.',
      'Bölümler bağlantılı kayda geçer; işlem sahibinin ekranında yapılır.',
    ],
    sinirlar: [
      'Yalnız okur; burada kayıt değişmez.',
      'Her bölüm kendi yetkisiyle görünür; yetkiniz olmayan bölüm gösterilmez.',
    ],
    sozcukler: ['kaynak', '360', 'istasyon', 'makine', 'personel', 'yetkinlik', 'oee'],
  },
];
