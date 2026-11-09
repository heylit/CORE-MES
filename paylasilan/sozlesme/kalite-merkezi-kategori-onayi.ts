import { z } from 'zod';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// 2466 (2461-2 a): tedarikçinin kategori başına Kalite kararı. Kategori Malzemeler ağacındaki (tür, kod) anahtarıdır (2461-4 a).
export const KM_KATEGORI_TURLERI = ['hammadde', 'sarf', 'demirbas', 'hizmet'] as const;
export type KmKategoriTuru = (typeof KM_KATEGORI_TURLERI)[number];
export const KM_KATEGORI_DURUMLARI = ['onayli', 'sartli', 'onaysiz'] as const;
export type KmKategoriDurumu = (typeof KM_KATEGORI_DURUMLARI)[number];
// 'kategori': kategori kararı. 'firma_askida' (2466-2 a): firma geneli kayıt Askıda; firmanın bütün kategorileri onaysız okunur.
export const KM_KATEGORI_KAYNAKLARI = ['kategori', 'firma_askida'] as const;
export type KmKategoriKaynagi = (typeof KM_KATEGORI_KAYNAKLARI)[number];

const firmaKimligi = z.number().int().positive().max(2147483647);
const kategoriKodu = z.string().trim().min(1).max(40);

export const kmKategoriOnayiSorgusu = z.object({ firmaId: z.coerce.number<number>().int().positive().max(2147483647) });

// Yeni kararda surum null; değiştirmede okunan sürüm. Şartlı kararın şartı yazılır.
export const kmKategoriKarariGovdesi = z.object({
  firmaId: firmaKimligi,
  kategoriTuru: z.enum(KM_KATEGORI_TURLERI),
  kategoriKodu,
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  aciklama: z.string().trim().max(500).nullable().transform((v) => (v === '' ? null : v)),
  surum: surumSemasi.nullable(),
}).refine((g) => g.durum !== 'sartli' || g.aciklama !== null, { message: 'Şartlı kararda şart yazılmalıdır.', path: ['aciklama'] });
export type KmKategoriKarariGovdesi = z.output<typeof kmKategoriKarariGovdesi>;
export const kmKategoriKarariCevabi = z.object({ surum: surumSemasi });

export const kmKategoriOnayi = z.object({
  kategoriTuru: z.enum(KM_KATEGORI_TURLERI),
  kategoriKodu: z.string(),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  kaynak: z.enum(KM_KATEGORI_KAYNAKLARI),
  tarih: zamanSemasi,
  kisiAd: z.string().nullable(),
  aciklama: z.string().nullable(),
  surum: surumSemasi,
});
export type KmKategoriOnayi = z.output<typeof kmKategoriOnayi>;

export const kmKategoriDugumu = z.object({ tur: z.enum(KM_KATEGORI_TURLERI), kod: z.string(), ad: z.string(), ustAd: z.string(), aktif: z.boolean() });
export type KmKategoriDugumu = z.output<typeof kmKategoriDugumu>;

// Ekran kararları olduğu gibi görür (kaynak hep 'kategori'); firma askısı ayrı alandadır.
export const kmKategoriOnaylariCevabi = z.object({
  firmaAskida: z.object({ tarih: zamanSemasi }).nullable(),
  onaylar: z.array(kmKategoriOnayi),
  agac: z.array(kmKategoriDugumu),
});
export type KmKategoriOnaylariCevabi = z.output<typeof kmKategoriOnaylariCevabi>;
