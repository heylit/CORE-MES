import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Müşteri, tedarikçi ve fason firmaların tek kartı (kart #1164). Finans, satın alma, sevkiyat ve öteki modüller firmayı buradan alır.
export const MUSTERI_TEDARIKCI_SAYFALARI = [
  { yol: '/musteri-tedarikci', islem: 'sayfa.musteri-tedarikci', baslik: 'Müşteriler ve Tedarikçiler', simge: 'building', grup: 'Tanımlar', sira: 45 },
] as const satisfies readonly SayfaTanimi[];

export const MUSTERI_TEDARIKCI_IKINCI_MENU = {
  kok: '/musteri-tedarikci',
  baslik: 'Müşteriler ve Tedarikçiler',
  simge: 'building',
  gruplar: [
    { maddeler: [
      { anahtar: 'tumu', baslik: 'Tüm firmalar', yol: '/musteri-tedarikci', simge: 'list', islem: 'musteri-tedarikci.oku' },
      { anahtar: 'musteriler', baslik: 'Müşteriler', yol: '/musteri-tedarikci/musteriler', simge: 'user', islem: 'musteri-tedarikci.oku' },
      { anahtar: 'tedarikciler', baslik: 'Tedarikçiler', yol: '/musteri-tedarikci/tedarikciler', simge: 'truck', islem: 'musteri-tedarikci.oku' },
      { anahtar: 'fason', baslik: 'Fason firmalar', yol: '/musteri-tedarikci/fason', simge: 'tool', islem: 'musteri-tedarikci.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
