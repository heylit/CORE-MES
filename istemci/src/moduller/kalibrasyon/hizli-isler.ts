import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'kalibrasyon-alet', sira: 10, baslik: 'Ölçü aleti kalibrasyondan döndü', aciklama: 'Ölçü Aletleri: kalibrasyon tarihini ve sonucunu girin.', simge: 'ruler', yol: '/kalibrasyon', islem: 'kalibrasyon.yaz' },
];
