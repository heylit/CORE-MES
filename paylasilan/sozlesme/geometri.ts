import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// 3D Atölyesi (kart 1441): malzeme kartına bağlı, yayındaki STEP/IGES modelinin geometri analizi. Ölçüler mm; değerler üçgen
// ağından hesaplanır (yaklaşıktır, yuvarlatılmış yüzeyde ağ inceliğine bağlı). Analizi olmayan alan null'dır, sıfır uydurulmaz.

export const GEOMETRI_IS_DURUMLARI = ['bekliyor', 'calisiyor', 'bitti', 'hata'] as const;
export type GeometriIsDurumu = (typeof GEOMETRI_IS_DURUMLARI)[number];
// Ekran durumu: iş yoksa (tarama henüz yakalamadı) 'yok'.
export const GEOMETRI_DURUMLARI = ['yok', ...GEOMETRI_IS_DURUMLARI] as const;
export type GeometriDurumu = (typeof GEOMETRI_DURUMLARI)[number];
export const GEOMETRI_DOSYA_TURLERI = ['step', 'iges'] as const;
export type GeometriDosyaTuru = (typeof GEOMETRI_DOSYA_TURLERI)[number];

const mm = z.number().nonnegative();

export const geometriAnaliziSemasi = z.object({
  motor: z.string(),
  // Eksenlere hizalı dış kutu (modelin kendi eksenlerinde).
  kutu: z.object({ x: mm, y: mm, z: mm }),
  // Döndürülmüş en küçük kutu: kenarlar büyükten küçüğe; yon satırları kutu eksenleri (birim vektör). cap: uzun eksen (a) çevresinde
  // parçayı kapsayan en küçük daire çapı (döner parçada parçanın çapı).
  obb: z.object({ a: mm, b: mm, c: mm, cap: mm, yon: z.array(z.array(z.number()).length(3)).length(3) }),
  // Ağ kapalı değilse null.
  hacimMm3: z.number().positive().nullable(),
  alanMm2: mm,
  govdeSayisi: z.number().int().min(1),
  kapali: z.boolean(),
  ucgenSayisi: z.number().int().min(1),
  hesapSuresiMs: z.number().int().min(0),
  hesapZamani: zamanSemasi,
});
export type GeometriAnalizi = z.output<typeof geometriAnaliziSemasi>;

export const geometriIsSemasi = z.object({
  durum: z.enum(GEOMETRI_IS_DURUMLARI),
  denemeSayisi: z.number().int().min(0),
  hataMetni: z.string().nullable(),
  olusturma: zamanSemasi,
  baslama: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
  surum: surumSemasi,
});

export const revizyonParametresi = z.object({ revizyonId: z.coerce.number().int().min(1) });

// Model listesi: 3B modeli olan malzemeler, model başına bir satır.
export const geometriModelListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  ara: z.string().trim().max(100).optional(),
  durum: z.enum(GEOMETRI_DURUMLARI).optional(),
});
export const geometriModelSatiri = z.object({
  malzemeNo: z.number().int(),
  malzemeKodu: z.string(),
  malzemeAdi: z.string().nullable(),
  belgeId: z.number().int(),
  belgeAdi: z.string(),
  revizyonId: z.number().int(),
  harf: z.string(),
  dosyaTuru: z.enum(GEOMETRI_DOSYA_TURLERI),
  durum: z.enum(GEOMETRI_DURUMLARI),
  hataMetni: z.string().nullable(),
});
export type GeometriModelSatiri = z.output<typeof geometriModelSatiri>;
export const geometriModelListeCevabi = listeCevapSemasi(geometriModelSatiri);
export type GeometriModelListeCevabi = z.output<typeof geometriModelListeCevabi>;

export const geometriAnalizCevabi = z.object({
  revizyonId: z.number().int(),
  belgeId: z.number().int(),
  dosyaTuru: z.enum(GEOMETRI_DOSYA_TURLERI),
  durum: z.enum(GEOMETRI_DURUMLARI),
  is: geometriIsSemasi.nullable(),
  // Analiz başka içeriğe (eski özet) aitse gösterilmez: null.
  analiz: geometriAnaliziSemasi.nullable(),
});
export type GeometriAnalizCevabi = z.output<typeof geometriAnalizCevabi>;

// Pay her yüzeye eklenen işleme payıdır (mm). Ayarı Malzemeler'in stok ölçü listesiyle gelir (1433 a); o gelene kadar ekran sorar.
export const PAY_EN_COK_MM = 100;
export const geometriHamSorgusu = z.object({ payMm: z.coerce.number().min(0).max(PAY_EN_COK_MM) });
export const HAM_STOK_NEDENLERI = ['stok-listesi-yok', 'analiz-yok'] as const;
export const geometriHamCevabi = z.object({
  revizyonId: z.number().int(),
  payMm: z.number(),
  // Döndürülmüş kutu + iki yüzde pay; analiz yoksa null.
  enAz: z.object({ a: mm, b: mm, c: mm }).nullable(),
  // En küçük uygun stok ölçüsü; liste yoksa ya da uygun ölçü yoksa null ve neden.
  stokOlcusu: z.null(),
  neden: z.enum(HAM_STOK_NEDENLERI),
});
export type GeometriHamCevabi = z.output<typeof geometriHamCevabi>;

// İş henüz yoksa null gönderilir (ekran 'yok' gördü); iş varsa okunan sürüm.
export const yenidenHesaplaGovdesi = z.object({ surum: surumSemasi.nullable() }).strict();
export const yenidenHesaplaCevabi = geometriAnalizCevabi;
