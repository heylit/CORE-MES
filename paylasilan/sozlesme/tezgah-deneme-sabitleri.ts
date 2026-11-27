// Tezgâh deneme sayfası (kart 3811) sabitleri; zod taşımaz, istemci değer olarak ithal eder.
export const DENEME_PENCERELERI = ['bugun', 'dun', 'yedi-gun'] as const;
export type DenemePenceresi = (typeof DENEME_PENCERELERI)[number];

export const VARSAYILAN_CEVRIMDE_PARCA = 1;
// Program eşleşmesi (3811-2): kesin, adımın NC program alanıyla; tahmin, alan yokken programda parça no ve OP bulunarak.
export const PROGRAM_ESLESMELERI = ['kesin', 'tahmin', 'uyusmuyor', 'bilinmiyor'] as const;
export type ProgramEslesmesi = (typeof PROGRAM_ESLESMELERI)[number];
export const VARSAYILAN_DURUS_ESIGI_DK = 5;

// Geçiş hazırlığı eşikleri öneridir ve yalnız burada durur (sunucu hesabı ve ekran metni bunları okur).
export const GECIS_ESIKLERI = { veriBoslugu: 0.02, sayacFarki: 0.01, enAzIs: 3, programEslesmesi: 0.95, saatFarkiSn: 60, isEslesmesi: 0.95, uyusmazlik: 0.02 } as const;
// a-f ilk tanım; g (üretim artışlarının işe bağlanması) ve h (uyuşmayan program oranı) 3811-2.
export const GECIS_OLCUTLERI = ['esleme', 'veri-boslugu', 'sayac-farki', 'program-eslesmesi', 'alarm-okunuyor', 'saat-farki', 'is-eslesmesi', 'uyusmazlik'] as const;
export type GecisOlcutu = (typeof GECIS_OLCUTLERI)[number];
