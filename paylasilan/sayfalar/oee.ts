import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const OEE_SAYFALARI = [
  { yol: '/oee', islem: 'sayfa.oee', baslik: 'OEE', simge: 'bolt', grup: 'Üretim', sira: 60 },
] as const satisfies readonly SayfaTanimi[];

// İki bölüm aynı okumadır (oee.oku): iş merkezi ve istasyon özeti, makine listesi.
export const OEE_IKINCI_MENU = {
  kok: '/oee',
  baslik: 'OEE',
  simge: 'gauge',
  gruplar: [
    { maddeler: [
      { anahtar: 'ozet', baslik: 'İş merkezleri', yol: '/oee', simge: 'chart', islem: 'oee.oku' },
      { anahtar: 'makineler', baslik: 'Makineler', yol: '/oee/makineler', simge: 'cpu', islem: 'oee.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
