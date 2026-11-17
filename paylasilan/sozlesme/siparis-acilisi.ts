import { z } from 'zod';
import { EMIR_TURLERI } from './emir-turleri.ts';
import { tarihSemasi } from '../zaman.ts';

// 3272: sipariş onayında açılacak (ya da açılmış) proje ve emirler. Sahibi Üretim Emirleri; onay penceresi ve siparişin
// "Proje ve emirler" kartı aynı cevabı okur. Fiyat taşınmaz.
const KIMLIK = z.number().int().positive();
const EMIR_DURUMLARI = ['taslak', 'planli', 'basladi', 'bitti', 'iptal'] as const;

// Emri açılmayacak kalem partisinin nedeni: malzeme üretilmiyor (ticari mal, hammadde) ya da adet tam sayı değil.
export const SIPARIS_ACILISI_ATLAMALARI = ['uretilmez', 'tam-sayi-degil'] as const;

// 3272-2 (Atölye şartı, KURGU 9): dokunulmamış emirde malzeme talebi ya da tamamlanmış hazırlık maddesi varsa onay geri alma ve iptal
// kilitlemez ama uyarır (satın alma siparişi ve stok fişi kilitler).
export const SIPARIS_ACILISI_UYARILARI = ['talep', 'hazirlik'] as const;

export const siparisAcilisiParametresi = z.object({ siparisId: z.coerce.number<number>().int().positive().max(2147483647) });

export const siparisAcilisiSatiri = z.object({
  kalemId: KIMLIK,
  kalemSira: z.number().int(),
  partiId: KIMLIK.nullable(),
  malzemeNo: KIMLIK,
  malzemeKodu: z.string().nullable(),
  malzemeAdi: z.string().nullable(),
  emirTuru: z.enum(EMIR_TURLERI),
  // Tam sayı değilse null (atlama "tam-sayi-degil").
  adet: z.number().int().nullable(),
  teslim: tarihSemasi.nullable(),
  // Emrin türüne düşen rota ve yürürlükteki revizyonu; rota ya da yürürlükte revizyon yoksa null ("Rota bekliyor"). 3296-3 a: elle true
  // ise partide seçilen rota; seçilen rota kullanılamadıysa (yürürlükte değil) türün rotası gelir ve elleDustu true olur.
  // seriyeDustu (3411 a): emrin türünün yürürlükte rotası yok; emir Seri rotasıyla açılır.
  rota: z.object({ ad: z.string(), harf: z.string(), elle: z.boolean().optional(), elleDustu: z.boolean().optional(), seriyeDustu: z.boolean().optional() }).nullable(),
  emir: z.object({ id: KIMLIK, no: z.string(), durum: z.enum(EMIR_DURUMLARI), rotaBekliyor: z.boolean() }).nullable(),
  atlama: z.enum(SIPARIS_ACILISI_ATLAMALARI).nullable(),
});

export const siparisAcilisiCevabi = z.object({
  // "Sipariş onayında proje ve emir aç" ayarı.
  acik: z.boolean(),
  // Var olan proje (id dolu) ya da açılacak projenin önerilen numarası ve adı.
  proje: z.object({ id: KIMLIK.nullable(), kod: z.string(), ad: z.string(), bitis: tarihSemasi.nullable() }),
  satirlar: z.array(siparisAcilisiSatiri),
  // Okuyan kişide onayla birlikte açmak için eksik olan işlemler (3272-1 b: eksikse onay reddedilir).
  eksikIslemler: z.array(z.string()),
  // Onay geri alınınca kalemden çözülecek, iptalde iptal olacak emirlerden talebi ya da tamamlanmış hazırlığı olanlar.
  geriAlmaUyarilari: z.array(z.object({ emirId: KIMLIK, emirNo: z.string(), nedenler: z.array(z.enum(SIPARIS_ACILISI_UYARILARI)).min(1) })),
});

export const siparisAcilisiGovdesi = z.object({ projeKodu: z.string().trim().min(1).max(24).optional() });
export const siparisAcilisiSonucu = z.object({ projeId: KIMLIK.nullable(), acilan: z.number().int(), baglanan: z.number().int() });

export type SiparisAcilisiCevabi = z.output<typeof siparisAcilisiCevabi>;
export type SiparisAcilisiSatiri = z.output<typeof siparisAcilisiSatiri>;
export type SiparisAcilisiGovdesi = z.input<typeof siparisAcilisiGovdesi>;
export type SiparisAcilisiSonucu = z.output<typeof siparisAcilisiSonucu>;
export type SiparisAcilisiUyarisi = (typeof SIPARIS_ACILISI_UYARILARI)[number];
export type SiparisAcilisiAtlamasi = (typeof SIPARIS_ACILISI_ATLAMALARI)[number];
