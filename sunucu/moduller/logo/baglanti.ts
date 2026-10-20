import { logoAyariOku } from './ayar.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import type { KopruIstemcisi } from './kopru.ts';

// Ortam değişkenleri açılışta bir kez okunur: yoksa köprü yoktur (istek atılmaz); geçersiz değer açılışı durdurur.
const ortamAyari = logoAyariOku(process.env);

export const ortamKoprusu: KopruIstemcisi | null = ortamAyari === null ? null : kopruIstemcisiKur(ortamAyari);

// Hazırlık ekranı için: adres kurum içidir ve yöneticiye gösterilir; anahtarın yalnız tanımlı olduğu söylenir.
export const ortamOzeti = { adres: ortamAyari?.adres ?? null, anahtarTanimli: ortamAyari !== null };
