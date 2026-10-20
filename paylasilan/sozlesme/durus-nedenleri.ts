import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';

export const KATEGORILER = ['plansiz', 'planli'] as const;
export const CAGRI_EKIPLERI = ['bakim', 'kalite', 'malzeme', 'amir'] as const;

export const KOD_DESENI = /^[A-Z0-9-]{1,12}$/;
export const AZAMI_GECIKME_DK = 1440;

const kod = z.string().trim().toUpperCase().regex(KOD_DESENI, 'Kod en çok 12 karakter olur; büyük harf, rakam ve tire içerir.');
const ad = z.string().trim().min(1, 'Ad zorunlu.').max(80, 'Ad en çok 80 karakter olur.');

export const nedenParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });

// Seçim listesi pasifleri saklar; yönetim ekranı hepsini ister.
export const nedenSorgusu = z.object({
  yalnizAktif: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
});

const durusAlanlari = z.object({
  kod,
  ad,
  simge: z.string().trim().regex(/^[a-z0-9-]{1,30}$/, 'Simge adı geçersiz.').nullable().default(null),
  kategori: z.enum(KATEGORILER),
  cagriEkibi: z.enum(CAGRI_EKIPLERI).nullable().default(null),
  cagriGecikmeDk: z.number().int().min(0).max(AZAMI_GECIKME_DK).nullable().default(null),
});

export const durusNedeniOlusturGovdesi = durusAlanlari;
export const durusNedeniGuncelleGovdesi = durusAlanlari.extend({ aktif: z.boolean(), ...beklenenSurum });
export const hurdaNedeniOlusturGovdesi = z.object({ kod, ad });
export const hurdaNedeniGuncelleGovdesi = hurdaNedeniOlusturGovdesi.extend({ aktif: z.boolean(), ...beklenenSurum });

export const durusNedeniSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  simge: z.string().nullable(),
  kategori: z.enum(KATEGORILER),
  cagriEkibi: z.enum(CAGRI_EKIPLERI).nullable(),
  cagriGecikmeDk: z.number().int().nullable(),
  aktif: z.boolean(),
  sira: z.number().int(),
  surum: surumSemasi,
});

export const hurdaNedeniSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  aktif: z.boolean(),
  sira: z.number().int(),
  surum: surumSemasi,
});

// Önerilen kod, pasifler dahil bütün kodlara göre bulunur; süzülmüş listeden hesaplanırsa pasif nedenin kodu yeniden verilirdi.
export const durusNedenleriCevabi = z.object({ nedenler: z.array(durusNedeniSemasi), onerilenKod: z.string() });
export const hurdaNedenleriCevabi = z.object({ nedenler: z.array(hurdaNedeniSemasi), onerilenKod: z.string() });

export type Kategori = (typeof KATEGORILER)[number];
export type CagriEkibi = (typeof CAGRI_EKIPLERI)[number];
export type DurusNedeni = z.output<typeof durusNedeniSemasi>;
export type HurdaNedeni = z.output<typeof hurdaNedeniSemasi>;
export type DurusNedenleriCevabi = z.output<typeof durusNedenleriCevabi>;
export type HurdaNedenleriCevabi = z.output<typeof hurdaNedenleriCevabi>;
export type DurusNedeniOlusturGovdesi = z.input<typeof durusNedeniOlusturGovdesi>;
export type DurusNedeniGuncelleGovdesi = z.input<typeof durusNedeniGuncelleGovdesi>;
export type HurdaNedeniOlusturGovdesi = z.input<typeof hurdaNedeniOlusturGovdesi>;
export type HurdaNedeniGuncelleGovdesi = z.input<typeof hurdaNedeniGuncelleGovdesi>;
