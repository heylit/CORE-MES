// Tezgâh deneme sayfası (kart 3811) sabitleri; zod taşımaz, istemci değer olarak ithal eder.
export const DENEME_PENCERELERI = ['bugun', 'dun', 'yedi-gun'] as const;
export type DenemePenceresi = (typeof DENEME_PENCERELERI)[number];

export const VARSAYILAN_CEVRIMDE_PARCA = 1;
export const VARSAYILAN_DURUS_ESIGI_DK = 5;

// Geçiş hazırlığı eşikleri öneridir ve yalnız burada durur (sunucu hesabı ve ekran metni bunları okur).
export const GECIS_ESIKLERI = { veriBoslugu: 0.02, sayacFarki: 0.01, enAzIs: 3, programEslesmesi: 0.95, saatFarkiSn: 60 } as const;
export const GECIS_OLCUTLERI = ['esleme', 'veri-boslugu', 'sayac-farki', 'program-eslesmesi', 'alarm-okunuyor', 'saat-farki'] as const;
export type GecisOlcutu = (typeof GECIS_OLCUTLERI)[number];
