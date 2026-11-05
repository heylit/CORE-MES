import type { AyarTanimi } from '../ayar-tanimi.ts';

// Fabrikanın konumu sevkiyat rotalarının başlangıç noktasıdır; boşken sevkiyat konumsuz çalışır.
export const SEVKIYAT_AYARLARI = {
  'sevkiyat.fabrika-enlem': {
    modul: 'sevkiyat', tur: 'sayi', varsayilan: null, enAz: -90, enCok: 90, ondalik: 6,
    baslik: 'Fabrika enlemi', aciklama: 'Ondalık derece (ör. 40,123456). Boş bırakılabilir.',
  },
  'sevkiyat.fabrika-boylam': {
    modul: 'sevkiyat', tur: 'sayi', varsayilan: null, enAz: -180, enCok: 180, ondalik: 6,
    baslik: 'Fabrika boylamı', aciklama: 'Ondalık derece (ör. 29,123456). Boş bırakılabilir.',
  },
  // 2133-4 a: fabrika noktasının adresi; konum doluysa fabrika noktası bu adresle kendiliğinden açılır.
  'sevkiyat.fabrika-adres': {
    modul: 'sevkiyat', tur: 'metin', varsayilan: '', enUzun: 400, bosOlabilir: true,
    baslik: 'Fabrika adresi', aciklama: 'Sevkiyat noktalarında ve sürücü rotasında görünen açık adres. Boş bırakılabilir.',
  },
} as const satisfies Record<string, AyarTanimi>;
