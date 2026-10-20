import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'mesaj-yaz', sira: 10, baslik: 'Birine haber vereceğim', aciklama: 'Mesaj: kişiye ya da gruba yazın.', simge: 'edit', yol: '/mesaj', islem: 'mesaj.yaz' },
];
