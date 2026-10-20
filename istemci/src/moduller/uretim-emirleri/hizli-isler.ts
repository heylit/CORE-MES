import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'uretim-emri-ac', sira: 10, baslik: 'Yeni üretim emri açacağım', aciklama: 'Mamul ya da yarı mamul için emir açın; iş emirleri rotadan gelir.', simge: 'list', yol: '/recete-rota', islem: 'rota.emre-kopyala' },
];
