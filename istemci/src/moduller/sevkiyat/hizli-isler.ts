import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'sevkiyat-gunluk', sira: 10, baslik: 'Sevke hazır ürün var', aciklama: 'Günlük sevkiyat: bekleyenleri araca ve rotaya yerleştirin.', simge: 'truck', yol: '/sevkiyat', islem: 'sevkiyat.plan-yaz' },
];
