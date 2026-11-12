import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';
import { MAL_KABUL_TURLERI } from './stok.ts';

// 3087 a, 3091 a: yarım kalan mal kabul kişinin hesabında taslak olarak durur; başka cihazda kalınan yerden sürer.
// Satırlar formun kendi durumudur (istemci yazar ve okur); sunucu yalnız sınırlar, anlamını denetlemez: mal kabul
// komutu teslimde her satırı ayrıca doğrular. Kişi başına tek taslak.
export const TASLAK_AZAMI_SATIR = 50;
export const TASLAK_AZAMI_BAYT = 256 * 1024;

export const malKabulTaslakFormu = z.object({
  tur: z.enum(MAL_KABUL_TURLERI),
  irsaliye: z.string().max(30),
  satirlar: z.array(z.record(z.string(), z.unknown())).max(TASLAK_AZAMI_SATIR),
});
export type MalKabulTaslakFormu = z.output<typeof malKabulTaslakFormu>;

export const malKabulTaslagi = z.object({ govde: malKabulTaslakFormu, surum: z.number().int(), guncellendi: zamanSemasi });
export const malKabulTaslagiCevabi = z.object({ taslak: malKabulTaslagi.nullable() });
export type MalKabulTaslagiCevabi = z.output<typeof malKabulTaslagiCevabi>;

// surum null: ilk yazma (taslak yoksa açılır); sayı: okunan sürüm, tutmazsa çakışma.
export const malKabulTaslagiKaydetGovdesi = z.object({ govde: malKabulTaslakFormu, surum: z.number().int().min(1).nullable() });
export type MalKabulTaslagiKaydetGovdesi = z.input<typeof malKabulTaslagiKaydetGovdesi>;
export const malKabulTaslagiKaydetCevabi = z.object({ surum: z.number().int(), guncellendi: zamanSemasi });
export type MalKabulTaslagiKaydetCevabi = z.output<typeof malKabulTaslagiKaydetCevabi>;

export const malKabulTaslagiSilGovdesi = z.object({ surum: z.number().int().min(1).nullable() });
export type MalKabulTaslagiSilGovdesi = z.input<typeof malKabulTaslagiSilGovdesi>;
