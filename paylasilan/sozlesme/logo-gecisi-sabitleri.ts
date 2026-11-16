// Logo geçişi (3068) sayıları; istemci de değer olarak okur, bu yüzden zod taşımaz (eslint.config.js ZODSUZ).
export const LOGO_GECIS_SAYFA_BOYU = 50;
// Tek toplu işlemde en çok bu kadar kart: yanlış seçimin geri alınacağı iş sınırlı kalsın.
export const LOGO_TOPLU_AZAMI = 200;
// Cariler sekmesi (3343) ve tek cari araması (2118): arama en az bu kadar karakter, sonuç ve toplu iş en çok bu kadar cari.
export const LOGO_CARI_ARAMA_EN_AZ = 3;
export const LOGO_CARI_SONUC_SINIRI = 50;
export const LOGO_CARI_TOPLU_SINIRI = LOGO_CARI_SONUC_SINIRI;
