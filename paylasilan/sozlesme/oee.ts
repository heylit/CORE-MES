import { z } from 'zod';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Tek okumada en uzun aralık (gün): makine başına vardiya takvimi ve sayım okunur, çeyrek yıl yeter.
export const AZAMI_OEE_GUNU = 92;

const gunFarki = (a: string, b: string): number => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

// Aralık tesis günüyle verilir, iki uç dahil.
export const oeeSorgusu = z.object({ baslangic: tarihSemasi, bitis: tarihSemasi })
  .refine((s) => gunFarki(s.baslangic, s.bitis) >= 0, { message: 'Bitiş başlangıçtan önce olamaz.', path: ['bitis'] })
  .refine((s) => gunFarki(s.baslangic, s.bitis) < AZAMI_OEE_GUNU, { message: `En çok ${AZAMI_OEE_GUNU} gün okunur.`, path: ['bitis'] });
export type OeeSorgusu = z.output<typeof oeeSorgusu>;

const oran = z.number().nullable();
const tutar = z.number().nullable();

// Süreler dakika. null: bilinmiyor (takvimi olmayan makine, sayımı olmayan dönem, girilmemiş maliyet); sıfır uydurulmaz.
export const oeeOlcusuSemasi = z.object({
  // Vardiya takvimi (planlı duruşlar düşülmüş, fazla mesai dahil); makinenin takvimi yoksa null.
  planliDk: z.number().nullable(),
  // Takvim süresi: aralığın bütün saatleri (TEEP paydası).
  takvimDk: z.number(),
  // Makinenin vardiya takvimi içinde iş tuttuğu süre; duraklatma ve duruş kullanımı kapatır, yani duruşlar düşülmüştür.
  calismaDk: z.number(),
  // Vardiya içinde sayılan sağlam adedin standart süresi (birim süresi olan iş emirlerinden).
  standartDk: z.number(),
  saglam: z.number().int(),
  hurda: z.number().int(),
  // Kalite kararıyla reddedilen adet; hurda gibi kalite kaybıdır.
  red: z.number().int(),
  // Birim süresi olmayan iş emrinde üretilen sağlam: standart süreye girmez, OEE'yi eksik gösterir.
  suresizSaglam: z.number().int(),
  // Vardiya takvimi dışında (vardiya dışı, mola, planlı duruş) çalışma ve sayım: OEE'ye girmez, ayrıca gösterilir.
  vardiyaDisi: z.object({ calismaDk: z.number(), standartDk: z.number(), saglam: z.number().int(), hurda: z.number().int(), red: z.number().int() }),
  kullanilabilirlik: oran,
  // Veri eksik: standart süre çalışma süresinden büyük (çalışma kaydı yok ya da az); performans, OEE ve TEEP null olur ve kayıt
  // üst düzey toplama (istasyon, iş merkezi, tesis) girmez. Üst düzeyde her zaman false.
  veriEksik: z.boolean(),
  performans: oran,
  kalite: oran,
  oee: oran,
  teep: oran,
  // Makineye düşen kişi payı (1 kişi 3 makineye bakıyorsa her makinede 0,33); atama yoksa null.
  kisiPayi: z.number().nullable(),
  // TRY; yalnız finans.maliyet-oku olana dolu, öbürüne null.
  makineMaliyeti: tutar,
  iscilikMaliyeti: tutar,
  birimMaliyet: tutar,
});
export type OeeOlcusu = z.output<typeof oeeOlcusuSemasi>;

const kimlik = z.number().int().positive();

export const oeeCevabi = z.object({
  // Hesabın penceresi: başlangıç gününün başı, bitiş gününün sonu ya da (bugün dahilse) okuma anı.
  pencere: z.object({ baslangic: zamanSemasi, bitis: zamanSemasi }),
  maliyetGorunur: z.boolean(),
  tesis: oeeOlcusuSemasi,
  isMerkezleri: z.array(oeeOlcusuSemasi.extend({ id: kimlik, kod: z.string(), ad: z.string() })),
  istasyonlar: z.array(oeeOlcusuSemasi.extend({ id: kimlik, kod: z.string(), ad: z.string(), isMerkeziId: kimlik })),
  makineler: z.array(oeeOlcusuSemasi.extend({
    id: kimlik, kod: z.string(), ad: z.string(), istasyonId: kimlik, isMerkeziId: kimlik,
  })),
});
export type OeeCevabi = z.output<typeof oeeCevabi>;
