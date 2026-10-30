import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ETIKET_MERKEZI_SAYFALARI = [
  { yol: '/etiket-merkezi', islem: 'sayfa.etiket-merkezi', baslik: 'Etiket Merkezi', simge: 'printer', grup: 'Stok', sira: 40 },
] as const satisfies readonly SayfaTanimi[];

// Şablon tasarımı sonraki adımda gelir. Yazıcılar ve baskı geçmişi veri işlemine bağlı görünür; sayfa işlemi yalnız menüyü açar.
export const ETIKET_MERKEZI_IKINCI_MENU = {
  kok: '/etiket-merkezi',
  baslik: 'Etiket Merkezi',
  simge: 'printer',
  gruplar: [
    { maddeler: [
      { anahtar: 'etiketler', baslik: 'Etiketler', yol: '/etiket-merkezi/etiketler', simge: 'list', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'sablonlar', baslik: 'Hazır şablonlar', yol: '/etiket-merkezi', simge: 'grid', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'deneme', baslik: 'Yazıcı denemesi', yol: '/etiket-merkezi/deneme', simge: 'gear', islem: 'sayfa.etiket-merkezi' },
      { anahtar: 'yazicilar', baslik: 'Yazıcılar', yol: '/etiket-merkezi/yazicilar', simge: 'cpu', islem: 'etiket-merkezi.yazici-yaz', veya: ['etiket-merkezi.oku'] },
      { anahtar: 'baskilar', baslik: 'Baskı geçmişi', yol: '/etiket-merkezi/baskilar', simge: 'clock', islem: 'etiket-merkezi.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
