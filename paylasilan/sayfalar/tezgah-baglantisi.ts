import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Deneme sayfası (kart 3373): yalnız bayraklı yönetici görür; SmartES'in altında durur.
export const TEZGAH_BAGLANTISI_SAYFALARI = [
  { yol: '/tezgah-baglantisi', islem: 'sayfa.tezgah-baglantisi', baslik: 'Tezgah bağlantısı (deneme)', simge: 'cpu', grup: 'Yönetim', sira: 9 },
] as const satisfies readonly SayfaTanimi[];

export const TEZGAH_BAGLANTISI_IKINCI_MENU = {
  kok: '/tezgah-baglantisi',
  baslik: 'Tezgah bağlantısı',
  simge: 'cpu',
  gruplar: [
    { maddeler: [
      { anahtar: 'karsilastirma', baslik: 'Karşılaştırma', yol: '/tezgah-baglantisi', simge: 'gauge', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'ayrinti', baslik: 'Tezgah ayrıntısı', yol: '/tezgah-baglantisi/ayrinti', simge: 'layers', islem: 'sayfa.tezgah-baglantisi' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
