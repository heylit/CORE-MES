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
  // Kart 3680: değer geçmişi tablosunun üst sınırı; aşılınca temizlikte en eski satırlar silinir ve veri boşluğu kaydı yazılır.
  'tezgah-baglantisi.satir-siniri': {
    modul: 'tezgah-baglantisi',
    tur: 'sayi',
    varsayilan: 2_000_000,
    // Yanlışlıkla düşük değer son 24 saati siler: alt sınır 100.000.
    enAz: 100_000,
    enCok: 100_000_000,
    ondalik: 0,
    baslik: 'Tezgâh değer geçmişi satır sınırı',
    aciklama: 'Tezgâh değer geçmişi tablosunun en çok satır sayısı. Temizlikte önce 24 saatten eski satırlar silinir; sınır yine aşılıyorsa en eski satırlar silinir ve zaman çizelgesine "satır sınırı" veri boşluğu yazılır. Doluluk, Tezgâh bağlantısı (deneme) ekranının üstünde görünür. Okuma kapalıyken etkisizdir.',
  },
} as const satisfies Record<string, AyarTanimi>;
