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

// ---- İhtiyaç kuyruğu (3398-2): teklif istenmeden önceki satın alma kalemleri stokla karşılaştırılır. Yalnız okur. ----
// karsilanir: istenen miktar stoktan çıkar; kismen: bir kısmı; yok: aday yok; bilinmiyor: kart ölçüsüz ya da birim çevrilemiyor.
export const IHTIYAC_DURUMLARI = ['karsilanir', 'kismen', 'yok', 'bilinmiyor'] as const;
export type IhtiyacDurumu = (typeof IHTIYAC_DURUMLARI)[number];
export const ihtiyacSatiri = z.object({
  kaynak: z.literal('satin-alma'),
  talepId: z.string(),
  talepNo: z.string(),
  baslik: z.string(),
  kalemId: z.string(),
  ad: z.string(),
  malzemeNo: z.number().int(),
  kod: z.string(),
  form: z.string().nullable(),
  kalite: z.string().nullable(),
  olcu: olcuNesnesi,
  miktar: ondalikMetinSemasi,
  birim: z.string(),
  uretimEmriId: z.number().int().nullable(),
  ihtiyacTarihi: z.string().nullable(),
  durum: z.enum(IHTIYAC_DURUMLARI),
  // Kalemin biriminde stoktan karşılanan; bilinmiyorsa null.
  karsilanan: z.number().nullable(),
  // Pay içindeki en iyi aday (sıranın ilki) ve pay içindeki aday sayısı.
  enIyi: olcuAdayi.nullable(),
  adaySayisi: z.number().int(),
  // Kalem Logo'ya, iş emrine, kalıba ya da teklife bağlı değilse stoktan karşılanabilir (3398-2 a).
  karsilanabilir: z.boolean(),
});
export type IhtiyacSatiri = z.output<typeof ihtiyacSatiri>;
export const ihtiyaclarCevabi = z.object({ satirlar: z.array(ihtiyacSatiri), sinirli: z.boolean() });
export type IhtiyaclarCevabi = z.output<typeof ihtiyaclarCevabi>;

// ---- Ayırma isteği (3398-2 a): "Stoktan karşıla" depoya istek açar, talep kalemi karşılanan kadar azalır; iptalde geri gelir. ----
export const AYIRMA_DURUMLARI = ['bekliyor', 'ayrildi', 'teslim', 'iptal'] as const;
export type AyirmaDurumu = (typeof AYIRMA_DURUMLARI)[number];
export const stoktanKarsilaGovdesi = z.object({
  talepId: z.uuid(),
  kalemId: z.uuid(),
  miktar: ondalikMetinSemasi.refine((m) => Number(m) > 0, 'Miktar sıfırdan büyük olmalı.'),
}).strict();
export type StoktanKarsilaGovdesi = z.input<typeof stoktanKarsilaGovdesi>;
export const ayirmaKaynagi = z.object({
  malzemeNo: z.number().int(),
  kod: z.string(),
  artikId: z.number().int().nullable(),
  // Stok biriminde ayrılan miktar; artıkta null (artığın kendisi ayrılır).
  stokMiktari: z.number().nullable(),
  // Bu kaynaktan karşılanan, kalemin biriminde.
  karsilanan: z.number(),
  konumlar: z.array(z.string()),
});
export const ayirmaIstegiSatiri = z.object({
  id: z.number().int(),
  talepId: z.string(),
  kalemId: z.string(),
  talepNo: z.string(),
  kalemAd: z.string(),
  malzemeNo: z.number().int(),
  kod: z.string(),
  miktar: ondalikMetinSemasi,
  birim: z.string(),
  uretimEmriId: z.number().int().nullable(),
  kaynaklar: z.array(ayirmaKaynagi),
  durum: z.enum(AYIRMA_DURUMLARI),
  iptalNedeni: z.string().nullable(),
  geriEklendi: z.boolean().nullable(),
  isteyen: z.string().nullable(),
  istekZamani: zamanSemasi,
  karar: z.string().nullable(),
  kararZamani: zamanSemasi.nullable(),
  surum: surumSemasi,
});
export type AyirmaIstegiSatiri = z.output<typeof ayirmaIstegiSatiri>;
export const ayirmaIstekleriSorgusu = z.object({ durum: z.enum(['acik', 'kapali']).default('acik') }).strict();
export const ayirmaIstekleriCevabi = z.object({ satirlar: z.array(ayirmaIstegiSatiri), sinirli: z.boolean() });
export type AyirmaIstekleriCevabi = z.output<typeof ayirmaIstekleriCevabi>;
export const ayirmaParametresi = z.object({ id: kimlik });
// Depo: bekleyen isteği "ayrıldı", ayrılanı "teslim" eder.
export const ayirmaIlerletGovdesi = z.object({ durum: z.enum(['ayrildi', 'teslim']), ...beklenenSurum }).strict();
export type AyirmaIlerletGovdesi = z.input<typeof ayirmaIlerletGovdesi>;
export const ayirmaIptalGovdesi = z.object({ neden: z.string().trim().min(1).max(200), ...beklenenSurum }).strict();
export type AyirmaIptalGovdesi = z.input<typeof ayirmaIptalGovdesi>;
export const ayirmaCevabi = z.object({ id: z.number().int(), surum: surumSemasi, durum: z.enum(AYIRMA_DURUMLARI), geriEklendi: z.boolean().nullable() });
export type AyirmaCevabi = z.output<typeof ayirmaCevabi>;
