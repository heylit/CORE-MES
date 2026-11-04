import type { KatalogTuru } from '#paylasilan/tezgah-katalogu.ts';
import type { TezgahTuru } from './tipler.ts';

// Katalog ortak veridir (2100-2 a, paylasilan/tezgah-katalogu.ts); modülün dosyaları onu buradan okur.
export * from '#paylasilan/tezgah-katalogu.ts';

// Tezgâh türü katalog türünün alt kümesi kalır: ortak tür daralırsa derleme burada durur.
type Uyum<A extends B, B> = A;
export type KatalogTezgahTuru = Uyum<TezgahTuru, KatalogTuru>;
