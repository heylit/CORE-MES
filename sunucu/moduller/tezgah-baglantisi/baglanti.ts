import { tezgahAdresiOku } from './ayar.ts';
import type { Lsv2Makinesi } from './ayar.ts';
import { tezgahIstemcisiKur } from './istemci.ts';
import type { TezgahIstemcisi } from './istemci.ts';
import { lsv2IstemcisiKur } from './lsv2.ts';
import type { Lsv2Istemcisi } from './lsv2.ts';

// Ortam değişkenleri açılışta bir kez okunur: yoksa istemci yoktur (istek atılmaz); geçersiz değer açılışı durdurur.
const adres = tezgahAdresiOku(process.env);

export const ortamIstemcisi: TezgahIstemcisi | null = adres === null ? null : tezgahIstemcisiKur(adres);

// Heidenhain makine listesi Sistem Ayarları'ndadır (kart 3757); her turda okunur.
export const lsv2IstemcisiVer = (m: Lsv2Makinesi): Lsv2Istemcisi => lsv2IstemcisiKur(m.adres, m.sayac);
