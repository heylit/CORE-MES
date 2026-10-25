// Yeni ekran Reçete ve Rota maddelerinin adresine geçti (541, 527 1 a); eski çerçeve bir süre aynı bölümle bu kökün altında açılır.
export const ESKI_KOK = '/recete-rota/eski';

// Menü maddesinin adresi -> eski çerçevedeki adresi: `/recete-rota` -> `/recete-rota/eski`, `/recete-rota/stock` -> `/recete-rota/eski/stock`.
export const eskiAdresi = (yol: string): `/${string}` => `${ESKI_KOK}${yol.slice('/recete-rota'.length)}`;
