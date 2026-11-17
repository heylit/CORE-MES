import { tezgahAdresiOku } from './ayar.ts';
import { tezgahIstemcisiKur } from './istemci.ts';
import type { TezgahIstemcisi } from './istemci.ts';

// Ortam değişkeni açılışta bir kez okunur: yoksa istemci yoktur (istek atılmaz); geçersiz değer açılışı durdurur.
const adres = tezgahAdresiOku(process.env);

export const ortamIstemcisi: TezgahIstemcisi | null = adres === null ? null : tezgahIstemcisiKur(adres);
