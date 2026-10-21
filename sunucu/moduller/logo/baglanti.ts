import { logoAyariOku } from './ayar.ts';
import { HIZMET_VAR_MI_YOLU, kopruIstemcisiKur } from './kopru.ts';
import type { KopruIstemcisi } from './kopru.ts';

// Ortam değişkenleri açılışta bir kez okunur: yoksa köprü yoktur (istek atılmaz); geçersiz değer açılışı durdurur.
const ortamAyari = logoAyariOku(process.env);

export const ortamKoprusu: KopruIstemcisi | null = ortamAyari === null ? null : kopruIstemcisiKur(ortamAyari, { hizmetVarMiYolu: HIZMET_VAR_MI_YOLU });

// Hazırlık ekranı için: adres yereldir (127.0.0.1) ve yöneticiye gösterilir; anahtarın yalnız tanımlı olduğu söylenir.
export const ortamOzeti = { adres: ortamAyari?.adres ?? null, anahtarTanimli: ortamAyari !== null };
