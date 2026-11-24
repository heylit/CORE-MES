import type { AyarTanimi } from '../ayar-tanimi.ts';

// Deneme (kart 3373, ADR 0033): kapalıyken ya da TMIV2_TEZGAH_MTCONNECT_ADRESI yokken hiçbir istek atılmaz.
export const TEZGAH_BAGLANTISI_AYARLARI = {
  'tezgah-baglantisi.okuma': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Tezgâh bağlantısı okuması (deneme)',
    aciklama: 'Açıkken tezgahların ortak MTConnect servisinden anlık değerler her okuma aralığında (varsayılan 5 saniye), yalnız okunarak alınır ve Tezgâh bağlantısı (deneme) ekranında SmartES değerleriyle yan yana gösterilir. Tezgaha komut gitmez; üretim kaydına, sayıma ve stoğa hiçbir şey işlenmez. Servis adresi sunucunun ortam değişkeninde yoksa açık olsa da istek atılmaz.',
  },
  // Servis başka sistemleri de besleyebilir: kod değiştirmeden yavaşlatılabilsin (kart 3659). Art arda hatada aralık kendiliğinden uzar.
  'tezgah-baglantisi.okuma-araligi': {
    modul: 'tezgah-baglantisi',
    tur: 'sayi',
    varsayilan: 5,
    enAz: 5,
    enCok: 60,
    ondalik: 0,
    baslik: 'Tezgâh bağlantısı okuma aralığı (saniye)',
    aciklama: 'Tezgâh servisinin iki okuma turu arasındaki süre. Servis başka sistemleri de besliyorsa yükseltin. Art arda hatada aralık 60 saniyeye kadar ikiye katlanarak uzar, başarılı turda bu değere döner. Okuma kapalıyken etkisizdir.',
  },
} as const satisfies Record<string, AyarTanimi>;
