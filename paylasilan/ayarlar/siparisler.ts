import type { AyarTanimi } from '../ayar-tanimi.ts';

const NUMARA_ACIKLAMASI = 'Yeni kaydın numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.';

export const SIPARISLER_AYARLARI = {
  'siparisler.siparis-no': {
    modul: 'siparisler', tur: 'numara', varsayilan: 'SS-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satış siparişi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  'siparisler.teklif-no': {
    modul: 'siparisler', tur: 'numara', varsayilan: 'TK-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satış teklifi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  // Varsayılan kapalı (291 a): kural Siparişler'de uygulanır; burada yalnız kayıt vardır.
  'siparisler.iskonto-dort-goz': {
    modul: 'siparisler', tur: 'boolean', varsayilan: false, baslik: 'Teklif iskontosunda dört göz',
    aciklama: 'Açıkken %10 üstü iskontolu teklif sürümünü veren kişi aynı sürümü onaylayamaz; onayı başka bir yetkili verir. Kapalıyken iskonto onayı yetkisi olan herkes onaylar.',
  },
  // Varsayılan kapalı (273): kural Siparişler'de uygulanır; burada yalnız kayıt vardır.
  'siparisler.termin-dort-goz': {
    modul: 'siparisler', tur: 'boolean', varsayilan: false, baslik: 'Teklif termin onayında dört göz',
    aciklama: 'Açıkken başka siparişi geciktiren termini içeren teklif sürümünü veren kişi aynı termini onaylayamaz; onayı başka bir yetkili verir. Kapalıyken termin onayı yetkisi olan herkes onaylar.',
  },
} as const satisfies Record<string, AyarTanimi>;
