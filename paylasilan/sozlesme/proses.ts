import { z } from 'zod';

// Parça proses dosyası (3277-5 a, 3290): parçanın proses zinciri tek ekranda; düzenleme sahibi modüldedir.
// Proses kendi kaydını tutmaz; halkaların durumu sahibin okumasından türer. Kaynağı olmayan halka "kaynak-yok" döner (3291'e kadar).

const kimlik = z.coerce.number<number>().int().positive().max(2147483647);
export const prosesParcaSorgusu = z.object({ malzemeNo: kimlik });

export const PROSES_HALKALARI = ['cizim', 'rota', 'nc', 'takim', 'baglama', 'kurulum', 'kontrol', 'ilk-parca'] as const;
// tamam: sahibinde onaylı ya da yürürlükte; eksik: var ama bir parçası eksik ya da eski; yok: hiç kayıt yok;
// gerekmez: bu parça için henüz istenmiyor (ör. açık emir yok); kaynak-yok: CORE MES'te bu halkanın parça düzeyinde okunacağı yer yok.
export const PROSES_HALKA_DURUMLARI = ['tamam', 'eksik', 'yok', 'gerekmez', 'kaynak-yok'] as const;

export const prosesHalkasi = z.object({
  anahtar: z.enum(PROSES_HALKALARI),
  durum: z.enum(PROSES_HALKA_DURUMLARI),
  ozet: z.string().nullable(),
  sahip: z.string(),
  // Düzenlemenin açıldığı sahip sayfası; kaynağı olmayanda null.
  yol: z.string().nullable(),
});

export const prosesOperasyonu = z.object({
  opNo: z.number().int(),
  ad: z.string(),
  fason: z.boolean(),
  // Adımın kaynağı (makine, istasyon ya da kişi) kodu, yoksa adı; fason ve kaynaksız adımda null.
  tezgah: z.string().nullable(),
  ayarSuresiDk: z.string().nullable(),
  birimSureDk: z.string().nullable(),
  // Rotanın kabul bekleyen işlem ölçümlerinin ortancası (rota Süreler ekranıyla aynı pencere); ölçüm yoksa null.
  gercek: z.object({ ortancaDk: z.string(), n: z.number().int() }).nullable(),
  // Operasyonun numune planının kapsadığı balon sayısı; planı olmayan op'ta null.
  karakteristik: z.number().int().nullable(),
  talimat: z.boolean(),
  numunePlani: z.boolean(),
});

export const prosesParcaCevabi = z.object({
  malzeme: z.object({ no: z.number().int(), kod: z.string(), ad: z.string().nullable() }),
  parcaRevizyonu: z.string().nullable(),
  rota: z.object({ revizyon: z.string(), acikTaslak: z.boolean() }).nullable(),
  halkalar: z.array(prosesHalkasi),
  operasyonlar: z.array(prosesOperasyonu),
});

export type ProsesHalkaAnahtari = (typeof PROSES_HALKALARI)[number];
export type ProsesHalkaDurumu = (typeof PROSES_HALKA_DURUMLARI)[number];
export type ProsesHalkasi = z.output<typeof prosesHalkasi>;
export type ProsesOperasyonu = z.output<typeof prosesOperasyonu>;
export type ProsesParcaCevabi = z.output<typeof prosesParcaCevabi>;
