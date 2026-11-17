import type { AyarTanimi } from '../ayar-tanimi.ts';

// Deneme (kart 3373, ADR 0033): kapalıyken ya da TMIV2_TEZGAH_MTCONNECT_ADRESI yokken hiçbir istek atılmaz.
export const TEZGAH_BAGLANTISI_AYARLARI = {
  'tezgah-baglantisi.okuma': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Tezgah bağlantısı okuması (deneme)',
    aciklama: 'Açıkken tezgahların ortak MTConnect servisinden anlık değerler dakikada bir, yalnız okunarak alınır ve Tezgah bağlantısı (deneme) ekranında SmartES değerleriyle yan yana gösterilir. Tezgaha komut gitmez; üretim kaydına, sayıma ve stoğa hiçbir şey işlenmez. Servis adresi sunucunun ortam değişkeninde yoksa açık olsa da istek atılmaz.',
  },
} as const satisfies Record<string, AyarTanimi>;
