// 1207 c: fasonda hurdaya ayrılan ve firmadan gelmeyen parça için hatalı türleri (göç 20261029116000). GKK bu kodlarla gelen parçayı
// firmada sayar; kod bu yüzden sabittir, adı ve aktifliği yöneticinindir. Ekran kodu kilitlemek için okur; zod taşımaz.
export const FIRMADA_HURDA_KODU = 'FSN-HURDA';
export const FIRMADAN_GELMEDI_KODU = 'FSN-GELMEDI';
export const SABIT_HURDA_KODLARI: readonly string[] = [FIRMADA_HURDA_KODU, FIRMADAN_GELMEDI_KODU];
