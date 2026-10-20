import type { AyarTanimi } from '../ayar-tanimi.ts';

// Doğrudan baskı varsayılan kapalıdır (98 evet); açıkken de yalnız TMIV2_ETIKET_YAZICI_AGI aralığındaki adrese gider.
export const ETIKET_MERKEZI_AYARLARI = {
  'etiket-merkezi.dogrudan-baski': {
    modul: 'etiket-merkezi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Etiket yazıcısına doğrudan baskı',
    aciklama: 'Açıkken Etiket Merkezi, ağdaki etiket yazıcısına sunucudan doğrudan basar (TCP 9100). Yalnız TMIV2_ETIKET_YAZICI_AGI ortam değişkenindeki kurum içi aralıktaki yazıcılara gider. Kapalıyken etiket komut dosyası indirilir.',
  },
} as const satisfies Record<string, AyarTanimi>;
