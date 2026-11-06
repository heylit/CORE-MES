import { z } from 'zod';

// 2151 (2151-1 b): Planlama analizi. Geçmiş haftalarda tezgâhın gerçek dolu süresi, ileri haftalarda canlı plandaki yükü, ikisi de
// tezgâhın çalışma takvimine oranla; plan güvenilirliğinin canlıya almalar boyunca eğilimi. Bilinmeyen değer null'dır, sıfır uydurulmaz.
export const PLAN_ANALIZI_GECMIS_HAFTA = 8;
export const PLAN_ANALIZI_ILERI_HAFTA = 8;
// EWMA uyarısının en az ölçüm sayısı (2151-3 b): altında eğri çizilir, uyarı verilmez ("yetersiz veri").
export const PLAN_ANALIZI_EWMA_EN_AZ = 20;

const KIMLIK = z.number().int().positive().max(2_147_483_647);
const SAYI = z.number().int().nonnegative();
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı.');

const hucre = z.object({
  // Haftadaki çalışma takvimi dakikası; takvimi okunamayan tezgâh sayılmaz. Hiçbir tezgâhın takvimi yoksa null.
  kapasiteDk: SAYI.nullable(),
  // Geçmiş haftada gerçek dolu dakika, ileri haftada canlı plandaki iş dakikası (çalışma aralığına düşen kısmı).
  yukDk: SAYI,
  // yuk / kapasite x 100, bir ondalık; kapasite yoksa ya da sıfırsa null.
  oran: z.number().nonnegative().nullable(),
});

export const planAnaliziCevabi = z.object({
  hesaplanan: z.string(),
  haftalar: z.array(z.object({ baslangic: tarih, bitis: tarih, ileri: z.boolean() }))
    .length(PLAN_ANALIZI_GECMIS_HAFTA + PLAN_ANALIZI_ILERI_HAFTA),
  istasyonlar: z.array(z.object({
    istasyonId: KIMLIK,
    ad: z.string(),
    makine: SAYI,
    // Çalışma takvimi okunamayan tezgâh: yükü de kapasitesi de sayılmaz.
    takvimsizMakine: SAYI,
    hucreler: z.array(hucre).length(PLAN_ANALIZI_GECMIS_HAFTA + PLAN_ANALIZI_ILERI_HAFTA),
  })),
  // İleri ilk dört haftada ortalama oranı en yüksek istasyon; oranı olan istasyon yoksa null.
  darbogaz: z.object({ istasyonId: KIMLIK, ad: z.string(), oran: z.number().nonnegative() }).nullable(),
  // Kişiye planlanmış (tezgâhsız) iş dakikası, ileri haftalarda; tezgâh kapasitesine katılmaz.
  kisiYukuDk: SAYI,
  zamaninda: z.object({
    // Canlıya alma başına "zamanında" yüzdesi ve üstel düzeltilmiş (EWMA) değeri; yüzdesi olmayan ölçüm atlanır.
    noktalar: z.array(z.object({ zaman: z.string(), yuzde: z.number().min(0).max(100), ewma: z.number().min(0).max(100) })),
    ornek: SAYI,
    gereken: SAYI,
    // Son EWMA, ilk ölçümlerin ortalamasından kontrol sınırı kadar uzaksa yön; ornek < gereken iken her zaman null.
    uyari: z.enum(['dusus', 'yukselis']).nullable(),
  }),
});

export type PlanAnaliziCevabi = z.output<typeof planAnaliziCevabi>;
export type PlanAnaliziHucresi = z.output<typeof hucre>;
