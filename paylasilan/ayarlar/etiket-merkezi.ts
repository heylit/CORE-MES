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
  // Kart 2954 (ADR 0014 eki): sistem genelinde kapalı başlar; açıkken de yalnız bu tarayıcıda USB yazıcıyı eşleştiren bilgisayar basar.
  'etiket-merkezi.usb-baski': {
    modul: 'etiket-merkezi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'USB etiket yazıcısına tarayıcıdan baskı',
    aciklama: 'Açıkken dosya türündeki yazıcı için "USB yazıcıya bas" düğmesi görünür: sunucu komutu üretip deftere yazar, tarayıcı komutu o bilgisayara USB ile bağlı yazıcıya aktarır. Yalnız HTTPS ve Chrome/Edge ile, yalnız yazıcıyı tarayıcıda eşleştirmiş bilgisayarda çalışır. Kapalıyken komut dosyası indirilir.',
  },
} as const satisfies Record<string, AyarTanimi>;
