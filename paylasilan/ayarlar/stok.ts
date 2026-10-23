import type { AyarTanimi } from '../ayar-tanimi.ts';

const ACIKLAMA = 'Yeni kaydın numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.';

export const STOK_AYARLARI = {
  'stok.mal-kabul-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'MK-{SAYAC:6}', alanlar: [], baslik: 'Mal kabul numarası', aciklama: ACIKLAMA,
  },
  'stok.fis-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'TF-{SAYAC:6}', alanlar: [], baslik: 'Transfer fişi numarası', aciklama: ACIKLAMA,
  },
  'stok.toplama-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'TL-{SAYAC:6}', alanlar: [], baslik: 'Toplama numarası', aciklama: ACIKLAMA,
  },
  'stok.malzeme-istegi-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'MI-{SAYAC:6}', alanlar: [], baslik: 'Malzeme isteği numarası', aciklama: ACIKLAMA,
  },
  'stok.teslim-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'TS-{SAYAC:6}', alanlar: [], baslik: 'Teslim numarası', aciklama: ACIKLAMA,
  },
  'stok.lot-no': {
    modul: 'stok', tur: 'numara', varsayilan: 'LT-{SAYAC:6}', alanlar: [], baslik: 'Lot numarası', aciklama: `${ACIKLAMA} Mal kabulde ve üretim girişinde her yeni partiye verilir.`,
  },
  'stok.yolda-suresi-dk': {
    modul: 'stok', tur: 'sayi', varsayilan: null, enAz: 1, enCok: 10080, ondalik: 0, baslik: 'Yolda süresi (dakika)',
    aciklama: 'Gönderilip bu süre içinde alınmayan teslim "süre doldu" notuyla iptal olur, stok kaynakta kalır, istek yeniden açılır. Boşsa teslim kendiliğinden düşmez.',
  },
} as const satisfies Record<string, AyarTanimi>;
