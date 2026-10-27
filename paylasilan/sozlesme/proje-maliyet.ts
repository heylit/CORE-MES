import { z } from 'zod';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

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
  ozet: z.lazy(() => maliyetOzetiSemasi),
});
export type ProjeMaliyetCevabi = z.output<typeof projeMaliyetCevabi>;
export type KalemSatiri = z.output<typeof kalemSatiriSemasi>;
export type SapanIsEmri = z.output<typeof sapanIsEmriSemasi>;


// --- Taban fotoğrafı (934, 936 a) ve üretim dışı masraf (911 b, 940 c) ---

// Taban: projenin plan maliyetinin elle alınan fotoğrafı. İlk taban gerekçesiz, her yenileme gerekçeli; eskiler geçmişte kalır.
export const tabanSemasi = z.object({
  sira: z.number().int().positive(),
  plan: tutar,
  kalemler: z.array(z.object({ kalem: z.enum(MALIYET_KALEMLERI), plan: tutar })),
  eksikKalemler: z.array(z.enum(MALIYET_KALEMLERI)),
  isEmriSayisi: z.number().int().positive(),
  gerekce: z.string().nullable(),
  kisiAd: z.string().nullable(),
  an: zamanSemasi,
});
// Projeye bağlanabilen gider kategorileri: üretim dışı proje masrafı. Faiz (finansman kalemi), vergi, kredi ve kur farkı girmez.
export const PROJE_MASRAF_KATEGORILERI = ['mal_alimi', 'personel', 'kira', 'enerji', 'lojistik', 'pazarlama', 'diger_gider'] as const;
export const masrafSatiriSemasi = z.object({
  id: z.number().int().positive(),
  belgeId: z.number().int().positive(),
  belgeNo: z.string().nullable(),
  belgeTarihi: tarihSemasi,
  kategori: z.string(),
  aciklama: z.string().nullable(),
  // KDV hariç TL. İptal edilen belge toplama girmez.
  tutarTl: z.number(),
  iptal: z.boolean(),
  gorevId: z.number().int().nullable(),
  kisiAd: z.string().nullable(),
  an: zamanSemasi,
});
export const maliyetOzetiSemasi = z.object({
  taban: tabanSemasi.nullable(),
  tabanGecmisi: z.array(tabanSemasi),
  masraflar: z.array(masrafSatiriSemasi),
  masrafToplami: z.number(),
  // Son gerçekleşen: üretim gerçekleşeni + bağlı masraf. Tahmini son: son gerçekleşen + kalan plan. Fark tahmini son - taban; taban yoksa null.
  sonGerceklesen: tutar,
  tahminiSon: tutar,
  fark: tutar,
});

export const tabanAlGovdesi = z.object({
  gerekce: z.string().trim().max(500, 'En çok 500 karakter.').nullish().transform((v) => (v === '' || v === undefined ? null : v)),
});
export const masrafBaglaGovdesi = z.object({
  belgeId: z.number().int().positive().max(2147483647),
  gorevId: z.number().int().positive().max(2147483647).nullish().transform((v) => v ?? null),
});
export const masrafParametresi = z.object({ bagId: z.coerce.number().int().positive().max(2147483647) });
export const masrafSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).default('') });
export const masrafSecenegiSemasi = z.object({
  id: z.number().int().positive(),
  belgeNo: z.string().nullable(),
  belgeTarihi: tarihSemasi,
  kategori: z.string(),
  aciklama: z.string().nullable(),
  // Yalnız finans.maliyet-oku olana; öteki kullanıcıya null.
  tutarTl: z.number().nullable(),
});
export const masrafSecenekleriCevabi = z.object({ belgeler: z.array(masrafSecenegiSemasi) });
export const yazmaCevabi = z.object({ tamam: z.literal(true) });

export type Taban = z.output<typeof tabanSemasi>;
export type MasrafSatiri = z.output<typeof masrafSatiriSemasi>;
export type MaliyetOzeti = z.output<typeof maliyetOzetiSemasi>;
export type TabanAlGovdesi = z.input<typeof tabanAlGovdesi>;
export type MasrafBaglaGovdesi = z.input<typeof masrafBaglaGovdesi>;
export type MasrafSecenekleriCevabi = z.output<typeof masrafSecenekleriCevabi>;
