import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'malzeme-yeni-kart', sira: 10, baslik: 'Yeni malzeme ya da hizmet kartı lazım', aciklama: 'Malzemeler ve Hizmetler: yeni kart açın.', simge: 'plus', yol: '/malzemeler/yeni', islem: 'malzemeler.yaz' },
];
