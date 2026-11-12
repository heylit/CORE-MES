import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ETIKET_MERKEZI_SAYFALARI = [
  { yol: '/etiket-merkezi', islem: 'sayfa.etiket-merkezi', baslik: 'Etiket Merkezi', simge: 'printer', grup: 'Stok', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

// 2992 a: ilk madde Pano. Etiket bas üç bölümlü baskı akışıdır; Basılacaklar olaydan doğan etiketlerdir; Otomatik baskılar olay -> etiket
// listesi ve bu cihazın tek dokunuş yazıcısıdır. Yazıcı denemesi Yazıcılar satırından açılır. Yazıcılar ve geçmiş veri işlemine bağlı görünür.
export const ETIKET_MERKEZI_IKINCI_MENU = {
  kok: '/etiket-merkezi',
  baslik: 'Etiket Merkezi',
  simge: 'printer',
  gruplar: [
    { maddeler: [
      { anahtar: 'pano', baslik: 'Pano', yol: '/etiket-merkezi', simge: 'dash', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'bas', baslik: 'Etiket bas', yol: '/etiket-merkezi/bas', simge: 'printer', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'etiketler', baslik: 'Basılacaklar', yol: '/etiket-merkezi/etiketler', simge: 'list', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'otomatik', baslik: 'Otomatik baskılar', yol: '/etiket-merkezi/otomatik', simge: 'bolt', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'baskilar', baslik: 'Baskı geçmişi', yol: '/etiket-merkezi/baskilar', simge: 'clock', islem: 'etiket-merkezi.oku' },
      { anahtar: 'yazicilar', baslik: 'Yazıcılar', yol: '/etiket-merkezi/yazicilar', simge: 'cpu', islem: 'etiket-merkezi.yazici-yaz', veya: ['etiket-merkezi.oku'] },
      { anahtar: 'katalog', baslik: 'Şablonlar', yol: '/etiket-merkezi/sablonlar', simge: 'grid', islem: 'sayfa.etiket-merkezi' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
