import { smartesAyariOku } from './ayar.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import type { SmartesIstemcisi } from './istemci.ts';

// Ortam değişkeni açılışta bir kez okunur: yoksa istemci yoktur (istek atılmaz); geçersiz değer açılışı durdurur.
const ortamAyari = smartesAyariOku(process.env);

export const ortamIstemcisi: SmartesIstemcisi | null = ortamAyari === null ? null : smartesIstemcisiKur(ortamAyari);

// Hazırlık ekranı için: adres ve ad alanı kurum içidir, yöneticiye gösterilir.
export const ortamOzeti = { adres: ortamAyari?.adres ?? null, adAlani: ortamAyari?.adAlani ?? null };
