import { z } from 'zod';
import { tarihSemasi } from '../zaman.ts';

export const projeMaliyetParametresi = z.object({ projeId: z.coerce.number().int().positive() });

// Maliyet kalemleri ekranın kırılım sırasıyla.
export const MALIYET_KALEMLERI = ['malzeme', 'isleme', 'ayar', 'fason', 'iscilik', 'genel_gider', 'finansman'] as const;
export type MaliyetKalemi = (typeof MALIYET_KALEMLERI)[number];

// Tutarlar TRY, KDV hariç. null: bilinmiyor (girilmemiş fiyat, bağlanmamış kaynak); sıfır uydurulmaz.
const tutar = z.number().nullable();
const oran = z.number().nullable();

export const kalemSatiriSemasi = z.object({
  kalem: z.enum(MALIYET_KALEMLERI),
  plan: tutar,
  gerceklesen: tutar,
  // (gerçekleşen - bugüne kadarki plan) / bugüne kadarki plan; ikisinden biri yoksa ya da plan sıfırsa null.
  sapmaOrani: oran,
});

export const haftaNoktasiSemasi = z.object({
  // Haftanın pazartesisi.
  hafta: tarihSemasi,
  planBirikimli: z.number(),
  gerceklesenBirikimli: z.number(),
});

export const sapanIsEmriSemasi = z.object({
  isEmriId: z.number().int().positive(),
  emirNo: z.string(),
  opNo: z.number().int(),
  istasyonAd: z.string().nullable(),
  plan: z.number(),
  gerceklesen: z.number(),
  sapma: z.number(),
  // En çok sapan kalem; sapmanın nedeni olarak gösterilir.
  neden: z.enum(MALIYET_KALEMLERI),
});

// Ekranda uyarı satırı olarak çıkan eksik veri: bağlanmamış kaynak ya da girilmemiş fiyat.
export const EKSIK_VERILER = [
  'siparis_yok', 'kur_yok', 'is_emirleri_bagli_degil', 'fason_bagli_degil', 'birim_maliyet_eksik', 'genel_gider_orani_yok', 'talas_dusulmedi', 'faiz_yok', 'vade_yok', 'amortisman_dahil_degil', 'satirsiz_emir',
] as const;
export type EksikVeri = (typeof EKSIK_VERILER)[number];

export const projeMaliyetCevabi = z.object({
  proje: z.object({ id: z.number().int().positive(), kod: z.string(), ad: z.string() }),
  siparis: z.object({
    id: z.number().int().positive(),
    no: z.string(),
    termin: tarihSemasi,
    paraBirimi: z.string(),
    // Sipariş para birimiyle KDV hariç tutar; TRY karşılığı gelir alanındadır. Fiyat yetkisi yoksa null.
    tutar,
  }).nullable(),
  // siparisler.fiyat-oku: yoksa gelir, katkı, sapma, kâr riski ve ceza null döner (180, 200).
  fiyatGorunur: z.boolean(),
  // Hesap günü (tesis günü); kâr riski ve gecikme buna göredir.
  bugun: tarihSemasi,
  gelir: tutar,
  // Proje bütçesi (198 a); girilmemişse hedef plan maliyetidir.
  butce: tutar,
  hedef: tutar,
  plan: tutar,
  gerceklesen: tutar,
  // Bugüne kadarki plan: bitmiş iş emrinin bütün planı, açık iş emrinin sağlam oranı kadarı.
  bugunePlan: tutar,
  kalanPlan: tutar,
  sapma: tutar,
  katkiPayi: tutar,
  katkiOrani: oran,
  planlananKatkiOrani: oran,
  karRiski: z.object({
    // Tahmini bitişin sipariş termininden sonraki gün sayısı; bitiş tahmini yoksa null.
    gecikmeGunu: z.number().int().nullable(),
    // Günlük oran, yüzde (0,3 = %0,3).
    gunlukOran: z.number(),
    tutar,
    // Sipariş gecikme cezası (günlük yüzde x gün, tavanla); siparişte oran yoksa null.
    ceza: tutar,
  }),
  kalemler: z.array(kalemSatiriSemasi),
  haftalar: z.array(haftaNoktasiSemasi),
  sapanIsEmirleri: z.array(sapanIsEmriSemasi),
  // Toplamlara girmeyen kalemler (planı ya da gerçekleşeni bilinmeyen).
  eksikKalemler: z.array(z.enum(MALIYET_KALEMLERI)),
  eksikler: z.array(z.enum(EKSIK_VERILER)),
});
export type ProjeMaliyetCevabi = z.output<typeof projeMaliyetCevabi>;
export type KalemSatiri = z.output<typeof kalemSatiriSemasi>;
export type SapanIsEmri = z.output<typeof sapanIsEmriSemasi>;

