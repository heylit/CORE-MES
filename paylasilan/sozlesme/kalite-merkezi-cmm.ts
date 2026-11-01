import { z } from 'zod';
import { kmOlcum } from './kalite-merkezi-studyo.ts';

// CMM sonuç dönüşü (1439 a): CMM'nin verdiği sonuç dosyası (CSV ya da QIF 3.0 Results) Kalite Merkezi ölçümüne `cmm` kaynağıyla
// girer. Önce önizlenir (yazmaz); yazma aynı dosyayı sunucuda yeniden okur, istemcinin gönderdiği değer yazılmaz.
// CMM yazılımına özgü biçim tanımı burada tutulmaz: sütun eşlemesi her yüklemede seçilir.

const kimlik = z.coerce.number().int().positive().max(2147483647);

// Dosya metni (istemci kodlamayı çözer). Fastify'ın 1 MiB gövde sınırına sığması için en çok 900 000 karakter.
export const KM_CMM_METIN_SINIRI = 900000;
export const KM_CMM_SATIR_SINIRI = 5000;
export const KM_CMM_BICIMLERI = ['csv', 'qif'] as const;
export const KM_CMM_SATIR_DURUMLARI = ['eslesti', 'nominalFarki', 'eslesmedi', 'belirsiz', 'yinelenen', 'degerYok', 'nitelBalon'] as const;

const sutun = z.number().int().nonnegative().max(199);
// CSV sütun eşlemesi (sıfırdan başlayan sütun sırası). Karakteristik ve ölçülen zorunlu; nominal verilirse balon nominaliyle karşılaştırılır.
export const kmCmmEsleme = z.object({ karakteristik: sutun, olculen: sutun, nominal: sutun.nullable() })
  .refine((e) => e.karakteristik !== e.olculen && e.nominal !== e.karakteristik && e.nominal !== e.olculen, 'Bir sütun bir alana eşlenir.');

export const kmCmmOnizleGovdesi = z.object({
  uretimEmriId: kimlik,
  resimId: kimlik,
  metin: z.string().min(1).max(KM_CMM_METIN_SINIRI),
  esleme: kmCmmEsleme.optional(),
});

// Yazma: önizlemedeki dosya ve eşleme yeniden verilir. Resmin sürümü önizlemedeki plandır: plan arada değiştiyse yazılmaz.
// Nominal farkı olan satır yalnız satır numarasıyla tek tek onaylanınca yazılır.
export const kmCmmYazGovdesi = kmCmmOnizleGovdesi.extend({
  resimSurumu: z.number().int().positive().max(2147483647),
  numuneId: kimlik.optional(),
  parcaSayisi: z.number().int().nonnegative().max(2147483647).optional(),
  onaylananlar: z.array(z.number().int().positive().max(KM_CMM_SATIR_SINIRI + 1)).max(500).default([]),
});

const sayiMetni = z.string().regex(/^-?\d+(\.\d+)?$/);
export const kmCmmSatiri = z.object({
  satir: z.number().int().positive(),
  karakteristik: z.string(),
  olculen: sayiMetni.nullable(),
  dosyaNominali: sayiMetni.nullable(),
  balonId: z.number().int().nullable(),
  balonNo: z.number().int().nullable(),
  balonNominali: z.string().nullable(),
  alt: sayiMetni.nullable(),
  ust: sayiMetni.nullable(),
  uygun: z.boolean().nullable(),
  durum: z.enum(KM_CMM_SATIR_DURUMLARI),
});

export const kmCmmOnizlemeCevabi = z.object({
  bicim: z.enum(KM_CMM_BICIMLERI),
  ayirici: z.string().nullable(),
  basliklar: z.array(z.string()),
  esleme: kmCmmEsleme.nullable(),
  resimSurumu: z.number().int().positive(),
  satirlar: z.array(kmCmmSatiri),
});

export const kmCmmYazCevabi = z.object({ olcumler: z.array(kmOlcum), atlanan: z.number().int().nonnegative() });

// CMM-2 ölçüm planı raporu: resmin balonlarından CMM programcısına yazdırılır iş listesi. Hizalama ve prob seçimi geometri ister;
// raporda programcıya bırakılır.
export const kmCmmPlanSatiri = z.object({
  no: z.number().int(),
  tur: z.string().nullable(),
  nominal: z.string(),
  tolerans: z.string().nullable(),
  alt: sayiMetni.nullable(),
  ust: sayiMetni.nullable(),
  kritik: z.boolean(),
  ozellik: z.string(),
  uydurma: z.string().nullable(),
  enAzNokta: z.number().int().positive().nullable(),
  not: z.string().nullable(),
});
export const kmCmmPlaniCevabi = z.object({
  resim: z.object({ id: z.number().int(), ad: z.string(), revizyon: z.string().nullable(), malzemeNo: z.number().int() }),
  kapsam: z.enum(['cmm', 'hepsi']),
  satirlar: z.array(kmCmmPlanSatiri),
});

export type KmCmmEsleme = z.output<typeof kmCmmEsleme>;
export type KmCmmOnizleGovdesi = z.input<typeof kmCmmOnizleGovdesi>;
export type KmCmmYazGovdesi = z.input<typeof kmCmmYazGovdesi>;
export type KmCmmYazVerisi = z.output<typeof kmCmmYazGovdesi>;
export type KmCmmSatiri = z.output<typeof kmCmmSatiri>;
export type KmCmmSatirDurumu = (typeof KM_CMM_SATIR_DURUMLARI)[number];
export type KmCmmOnizlemeCevabi = z.output<typeof kmCmmOnizlemeCevabi>;
export type KmCmmYazCevabi = z.output<typeof kmCmmYazCevabi>;
export type KmCmmPlanSatiri = z.output<typeof kmCmmPlanSatiri>;
export type KmCmmPlaniCevabi = z.output<typeof kmCmmPlaniCevabi>;
