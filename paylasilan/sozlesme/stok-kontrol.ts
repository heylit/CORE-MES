import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { surumSemasi, beklenenSurum } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import { OLCU_ANAHTARLARI, OLCULU_FORMLAR, PAY_TURLERI, VARSAYILAN_KESME_MM, VARSAYILAN_PAY, type OlcuAnahtari } from './stok-kontrol-sabitleri.ts';
export { ARTIK_HURDA_ESIGI_MM, FORM_ADLARI, FORM_OLCULERI, OLCU_ANAHTARLARI, OLCU_ETIKETLERI, OLCULU_FORMLAR, PAY_TURLERI, VARSAYILAN_KESME_MM, VARSAYILAN_PAY, type OlcuAnahtari, type OlculuForm, type PayTuru } from './stok-kontrol-sabitleri.ts';

const olcu = z.coerce.number<number>().positive().max(100000);
const olcuAlanlari = Object.fromEntries(OLCU_ANAHTARLARI.map((k) => [k, olcu.optional()])) as Record<OlcuAnahtari, z.ZodOptional<typeof olcu>>;

export const olcuAramaSorgusu = z.object({
  form: z.enum(OLCULU_FORMLAR),
  kalite: z.string().trim().min(1).max(100).optional(),
  ...olcuAlanlari,
  // Parçanın boyu ve (levhada) eni; boy formunda boşsa yalnız kesit aranır, parça sayısı hesaplanmaz.
  parcaBoyu: olcu.optional(),
  parcaEni: olcu.optional(),
  adet: z.coerce.number<number>().int().min(1).max(1000000).optional(),
  pay: z.enum(PAY_TURLERI).default(VARSAYILAN_PAY.tur),
  payDeger: z.coerce.number<number>().min(0).max(1000).default(VARSAYILAN_PAY.deger),
  payEnAzMm: z.coerce.number<number>().min(0).max(1000).default(VARSAYILAN_PAY.enAzMm),
  kesmeMm: z.coerce.number<number>().min(0).max(100).default(VARSAYILAN_KESME_MM),
  artik: z.enum(['evet', 'hayir']).default('evet'),
}).strict();
export type OlcuAramaSorgusu = z.input<typeof olcuAramaSorgusu>;

export const ADAY_DURUMLARI = ['tam', 'yakin', 'pay-disi'] as const;
export type AdayDurumu = (typeof ADAY_DURUMLARI)[number];
const olcuNesnesi = z.record(z.string(), z.number());

export const olcuAdayi = z.object({
  kaynak: z.enum(['stok', 'artik']),
  malzemeNo: z.number().int(),
  kod: z.string(),
  ad: z.string().nullable(),
  kalite: z.string().nullable(),
  form: z.enum(OLCULU_FORMLAR),
  olcu: olcuNesnesi,
  durum: z.enum(ADAY_DURUMLARI),
  // Kesit ölçüsü başına istenenden fazlası (mm).
  fazla: olcuNesnesi,
  // Kesit alanının istenene göre fazlası (yüzde, tam sayıya yuvarlı); hesaplanamazsa null.
  fireYuzde: z.number().nullable(),
  // Bu adaydan çıkan parça; boy ya da miktar bilinmiyorsa null (sıfır uydurulmaz).
  parcaSayisi: z.number().int().nullable(),
  miktar: ondalikMetinSemasi,
  birim: z.string().nullable(),
  konumlar: z.array(z.string()),
  artikId: z.number().int().nullable(),
  ilkGiris: zamanSemasi.nullable(),
});
export type OlcuAdayi = z.output<typeof olcuAdayi>;

export const olcuAramaCevabi = z.object({
  adaylar: z.array(olcuAdayi),
  // Sıradaki adaylardan (pay dışı hariç) karşılanan parça; adet ya da parça sayısı bilinmiyorsa null.
  karsilanan: z.number().int().nullable(),
  gereken: z.number().int().nullable(),
  // Formu tutan ama ölçüsü girilmemiş aktif kart sayısı: bunlar aranamadı.
  olcusuzKart: z.number().int(),
  kaliteler: z.array(z.string()),
});
export type OlcuAramaCevabi = z.output<typeof olcuAramaCevabi>;

// ---- Artık parça (kesimden kalan) ----
export const ARTIK_DURUMLARI = ['acik', 'kullanildi', 'hurda'] as const;
export type ArtikDurumu = (typeof ARTIK_DURUMLARI)[number];
const kimlik = z.coerce.number<number>().int().min(1).max(2147483647);

export const artikParcalarSorgusu = z.object({
  malzemeNo: kimlik.optional(),
  durum: z.enum(ARTIK_DURUMLARI).default('acik'),
}).strict();
export const artikParcaSatiri = z.object({
  id: z.number().int(),
  malzemeNo: z.number().int(),
  kod: z.string(),
  ad: z.string().nullable(),
  form: z.string().nullable(),
  konumId: z.number().int(),
  konumKod: z.string(),
  partiId: z.number().int().nullable(),
  olcu: olcuNesnesi,
  adet: z.number().int(),
  durum: z.enum(ARTIK_DURUMLARI),
  aciklama: z.string().nullable(),
  kaydeden: z.string().nullable(),
  kayitZamani: zamanSemasi,
  surum: surumSemasi,
});
export type ArtikParcaSatiri = z.output<typeof artikParcaSatiri>;
export const artikParcalarCevabi = z.object({ satirlar: z.array(artikParcaSatiri), sinirli: z.boolean() });
export type ArtikParcalarCevabi = z.output<typeof artikParcalarCevabi>;

// Boy formunda yalnız kalan boy, levhada kalan en ve boy yazılır; öteki ölçüler kartın ölçüsüdür.
export const artikParcaGovdesi = z.object({
  malzemeNo: kimlik,
  konumId: kimlik,
  partiId: kimlik.nullable().default(null),
  boy: olcu,
  en: olcu.nullable().default(null),
  adet: z.number().int().min(1).max(10000).default(1),
  aciklama: z.string().trim().min(1).max(200).nullable().default(null),
}).strict();
export type ArtikParcaGovdesi = z.input<typeof artikParcaGovdesi>;
export const artikParcaParametresi = z.object({ id: kimlik });
export const artikParcaKapatGovdesi = z.object({ durum: z.enum(['kullanildi', 'hurda']), ...beklenenSurum }).strict();
export type ArtikParcaKapatGovdesi = z.input<typeof artikParcaKapatGovdesi>;
export const artikParcaCevabi = z.object({ id: z.number().int(), surum: surumSemasi });
export type ArtikParcaCevabi = z.output<typeof artikParcaCevabi>;
