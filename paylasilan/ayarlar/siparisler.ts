import type { AyarTanimi } from '../ayar-tanimi.ts';

export const SIPARISLER_AYARLARI = {
  // Varsayılan kapalı (291 a): kural Siparişler'de uygulanır; burada yalnız kayıt vardır.
  'siparisler.iskonto-dort-goz': {
    modul: 'siparisler', tur: 'boolean', varsayilan: false, baslik: 'Teklif iskontosunda dört göz',
    aciklama: 'Açıkken %10 üstü iskontolu teklif sürümünü veren kişi aynı sürümü onaylayamaz; onayı başka bir yetkili verir. Kapalıyken iskonto onayı yetkisi olan herkes onaylar.',
  },
} as const satisfies Record<string, AyarTanimi>;
