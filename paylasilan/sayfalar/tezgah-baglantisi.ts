import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Deneme sayfası (kart 3373): yalnız bayraklı yönetici görür; SmartES'in altında durur.
export const TEZGAH_BAGLANTISI_SAYFALARI = [
  { yol: '/tezgah-baglantisi', islem: 'sayfa.tezgah-baglantisi', baslik: 'Tezgâh bağlantısı (deneme)', simge: 'chart', grup: 'Yönetim', sira: 9 },
] as const satisfies readonly SayfaTanimi[];

export const TEZGAH_BAGLANTISI_IKINCI_MENU = {
  kok: '/tezgah-baglantisi',
  baslik: 'Tezgâh bağlantısı',
  simge: 'chart',
  gruplar: [
    { maddeler: [
      { anahtar: 'karsilastirma', baslik: 'Karşılaştırma', yol: '/tezgah-baglantisi', simge: 'gauge', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'ayrinti', baslik: 'Tezgâh ayrıntısı', yol: '/tezgah-baglantisi/ayrinti', simge: 'layers', islem: 'sayfa.tezgah-baglantisi' },
    ] },
    // Gölge mod denemesi (kart 3811): hesaplar yalnız burada görünür, başka modüle yazılmaz.
    { baslik: 'Deneme', maddeler: [
      { anahtar: 'esleme', baslik: 'Eşleme', yol: '/tezgah-baglantisi/esleme', simge: 'route', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'sayim', baslik: 'Sayım', yol: '/tezgah-baglantisi/sayim', simge: 'list', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'durus', baslik: 'Duruş ve alarm', yol: '/tezgah-baglantisi/durus', simge: 'alert', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'oee', baslik: 'OEE', yol: '/tezgah-baglantisi/oee', simge: 'chart', islem: 'sayfa.tezgah-baglantisi' },
      { anahtar: 'gecis', baslik: 'Geçiş hazırlığı', yol: '/tezgah-baglantisi/gecis', simge: 'clipboard-check', islem: 'sayfa.tezgah-baglantisi' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
