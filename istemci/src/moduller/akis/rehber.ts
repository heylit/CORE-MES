import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/akis',
    ozet: 'Bir emrin mal kabulden sevke kadar her adımda ne kadar beklediğini ve işlendiğini gösterir.',
    nasil: [
      '"Emir ya da ürün ara" kutusuna yazıp emri seçin.',
      'Üstteki kartları okuyun: Uçtan uca, Hammadde bekleme, Üretim akış süresi, Sevk bekleme, Akış verimi.',
      '"Yolculuk" şeridi ile "Adımlar", "Statüde kalış" ve "Hammadde" tablolarına bakın.',
    ],
    sinirlar: [
      'Yalnız okur; burada kayıt değişmez.',
      'Süreler takvim saatiyle hesaplanır (gece ve hafta sonu dahil); soluk bölüm hâlâ sürüyor demektir.',
    ],
    sozcukler: ['lead time', 'cycle time', 'bekleme', 'süre', 'yolculuk'],
  },
];
