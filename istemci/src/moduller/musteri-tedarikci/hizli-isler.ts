import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'firma-yeni', sira: 10, baslik: 'Yeni müşteri ya da tedarikçi', aciklama: 'Müşteriler ve Tedarikçiler: firma kartı açın.', simge: 'user', yol: '/musteri-tedarikci', islem: 'musteri-tedarikci.yaz' },
];
