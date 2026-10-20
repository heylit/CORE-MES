import type { AyarTanimi } from '../ayar-tanimi.ts';

const NUMARA_ACIKLAMASI = 'Yeni kaydın numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.';

export const SATIN_ALMA_AYARLARI = {
  'satin-alma.dort-goz': {
    modul: 'satin-alma',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'Satın alma kararlarında dört göz kuralı',
    aciklama: 'Açıkken kararı veren kişi o kararı onaylayamaz. Kapalıyken verilen onay kayıtta dört gözsüz olarak işaretlenir.',
  },
  'satin-alma.talep-no': {
    modul: 'satin-alma', tur: 'numara', varsayilan: 'ST-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satın alma talebi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  'satin-alma.siparis-no': {
    modul: 'satin-alma', tur: 'numara', varsayilan: 'SP-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satın alma siparişi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  'satin-alma.katalog-kodu': {
    modul: 'satin-alma', tur: 'numara', varsayilan: 'M-{SAYAC:4}', alanlar: [], baslik: 'Satın alma katalog kodu',
    aciklama: NUMARA_ACIKLAMASI,
  },
} as const satisfies Record<string, AyarTanimi>;
