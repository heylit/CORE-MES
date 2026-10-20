// zod taşımaz: istemci bu listeleri değer olarak ithal eder (eslint.config.js ZODSUZ).
export const NEDENLER = ['toplanti', 'teslimat', 'servis', 'denetim', 'is_gorusmesi', 'diger'] as const;
// Bu nedenle gelen atölyeye girer: girişte kask ve gözlük verildiği işaretlenmeden içeri alınmaz (NZ-02).
export const ATOLYE_NEDENLERI: readonly Neden[] = ['servis', 'denetim'];
export const KIMLIK_TURLERI = ['tc_kimlik', 'pasaport', 'ehliyet', 'diger'] as const;
export const KART_TURLERI = ['ziyaretci', 'taseron'] as const;
// Saklanan kart durumu; "kullanımda" içerideki ziyaretten okunur, saklanmaz.
export const KART_KAYIT_DURUMLARI = ['bos', 'kayip', 'hasarli'] as const;
export const KART_DURUMLARI = ['bos', 'kullanimda', 'kayip', 'hasarli'] as const;
export const ZIYARET_DURUMLARI = ['beklenen', 'iceride', 'cikti', 'iptal'] as const;

export type Neden = (typeof NEDENLER)[number];
export type KimlikTuru = (typeof KIMLIK_TURLERI)[number];
export type KartTuru = (typeof KART_TURLERI)[number];
export type KartDurumu = (typeof KART_DURUMLARI)[number];
export type ZiyaretDurumu = (typeof ZIYARET_DURUMLARI)[number];
