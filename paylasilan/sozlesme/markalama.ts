import { z } from 'zod';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

export const YONTEMLER = ['lazer', 'nokta_vurus', 'murekkep', 'elektrokimyasal', 'etiket'] as const;
export const KOD_TURLERI = ['yok', 'qr', 'datamatrix'] as const;
export const ICERIKLER = ['seri', 'sabit'] as const;
export const SAYAC_KAPSAMLARI = ['malzeme', 'emir', 'yil'] as const;
export const BIRIM_DURUMLARI = ['saglam', 'red', 'rework', 'hurda'] as const;
export const BIRIM_OLAYLARI = ['markalandi', 'hatali_markalama', 'dogrulandi', 'red', 'rework', 'kabul', 'hurda'] as const;
// Birimin durumunu değiştiren komutlar; markalama ve doğrulama ayrı uçtur.
export const DURUM_KOMUTLARI = ['red', 'rework', 'kabul', 'hurda'] as const;
export const SABLON_PARCALARI = ['{PARCA}', '{EMIR}', '{YY}', '{YYYY}', '{WW}', '{MM}', '{DD}', '{SEQ:5}'] as const;
export const AZAMI_ALAN = 20;

const id = z.coerce.number().int().positive().max(2147483647);
const metin = (azami: number) => z.string().trim().min(1).max(azami);
const olcu = z.number().finite();

export const idParametresi = z.object({ id });
export const emirParametresi = z.object({ emirId: id });

const yerSemasi = z.object({
  merkez: z.tuple([olcu, olcu, olcu]),
  normal: z.tuple([olcu.min(-1).max(1), olcu.min(-1).max(1), olcu.min(-1).max(1)]),
  enMm: olcu.positive().max(999999),
  boyMm: olcu.positive().max(999999),
  aciDerece: olcu.gt(-360).lt(360),
});

export const alanGovdesi = z.object({
  ad: metin(60),
  icerik: z.enum(ICERIKLER),
  sabitMetin: metin(40).nullable().default(null),
  kodTuru: z.enum(KOD_TURLERI).default('yok'),
  yontem: z.enum(YONTEMLER),
  yaziYuksekligiMm: z.number().positive().max(100).nullable().default(null),
  program: metin(40).nullable().default(null),
  yuzey: metin(120).nullable().default(null),
  yer: yerSemasi.nullable().default(null),
});

const tanimAlanlari = z.object({
  seriSablonu: metin(60),
  sayacKapsami: z.enum(SAYAC_KAPSAMLARI).default('malzeme'),
  baslangicSirasi: z.number().int().min(1).max(99999999).default(1),
  dogrulama: z.boolean().default(true),
  model: z.object({ belgeId: id, revizyon: metin(10) }).nullable().default(null),
  alanlar: z.array(alanGovdesi).min(1, 'En az bir marka gerekir.').max(AZAMI_ALAN),
});

export const tanimEkleGovdesi = tanimAlanlari.extend({ malzemeId: id, opNo: id });
export const tanimKaydetGovdesi = tanimAlanlari.extend(beklenenSurum);

export const tanimSorgusu = z.object({ malzemeId: id.optional() });

export const alanSemasi = z.object({
  sira: z.number().int(),
  ad: z.string(),
  icerik: z.enum(ICERIKLER),
  sabitMetin: z.string().nullable(),
  kodTuru: z.enum(KOD_TURLERI),
  yontem: z.enum(YONTEMLER),
  yaziYuksekligiMm: z.number().nullable(),
  program: z.string().nullable(),
  yuzey: z.string().nullable(),
  yer: yerSemasi.nullable(),
});

export const tanimSemasi = z.object({
  id: z.number().int(),
  malzemeId: z.number().int(),
  // Malzeme kaydı yoksa (silinmiş ya da Aşama 2 bağı yok) boş.
  malzemeKodu: z.string().nullable(),
  opNo: z.number().int(),
  seriSablonu: z.string(),
  sayacKapsami: z.enum(SAYAC_KAPSAMLARI),
  baslangicSirasi: z.number().int(),
  dogrulama: z.boolean(),
  model: z.object({ belgeId: z.number().int(), revizyon: z.string() }).nullable(),
  alanlar: z.array(alanSemasi),
  surum: surumSemasi,
  degismeZamani: zamanSemasi,
});

export const tanimlarCevabi = z.object({ tanimlar: z.array(tanimSemasi) });

// Sıradaki numaralar sayacı tüketmeden gösterilir; markalama anında sunucu yeniden hesaplar.
export const onizlemeSorgusu = z.object({ emirId: id.optional() });
export const onizlemeCevabi = z.object({ numaralar: z.array(z.string()) });

// İstasyonda seçilecek emirler: tanımın malzemesinin açık emirleri.
export const tanimEmirleriCevabi = z.object({
  emirler: z.array(z.object({ id: z.number().int(), emirNo: z.string(), adet: z.number().int(), durum: z.string() })),
});

export const markalaGovdesi = z.object({
  tanimId: id,
  uretimEmriId: id,
  istasyonId: id.nullable().default(null),
  // 'hatali': numara yanar, birim hurdaya düşer.
  sonuc: z.enum(['iyi', 'hatali']),
});

export const dogrulaGovdesi = z.object({ tanimId: id, seriNo: metin(80) });

export const durumGovdesi = z.object({
  komut: z.enum(DURUM_KOMUTLARI),
  hurdaNedeniId: id.nullable().default(null),
  aciklama: metin(300).nullable().default(null),
  ...beklenenSurum,
});

export const birimSemasi = z.object({
  id: z.number().int(),
  seriNo: z.string(),
  tanimId: z.number().int(),
  malzemeId: z.number().int(),
  uretimEmriId: z.number().int(),
  istasyonId: z.number().int().nullable(),
  durum: z.enum(BIRIM_DURUMLARI),
  dogrulamaZamani: zamanSemasi.nullable(),
  surum: surumSemasi,
  zaman: zamanSemasi,
});

export const olaySemasi = z.object({
  id: z.number().int(),
  olay: z.enum(BIRIM_OLAYLARI),
  hurdaNedeniId: z.number().int().nullable(),
  aciklama: z.string().nullable(),
  kisiId: z.number().int(),
  zaman: zamanSemasi,
});

// Emir no okunur ad içindir; emir silinmişse boş.
export const birimAyrintisiCevabi = birimSemasi.extend({ emirNo: z.string().nullable(), olaylar: z.array(olaySemasi) });

export const birimSorgusu = z.object({
  seriNo: z.string().trim().min(1).max(80).optional(),
  emirId: id.optional(),
  durum: z.enum(BIRIM_DURUMLARI).optional(),
});
export const birimlerCevabi = z.object({ birimler: z.array(birimSemasi) });

export const emirOzetiCevabi = z.object({
  uretimEmriId: z.number().int(),
  sayilar: z.object({ saglam: z.number().int(), red: z.number().int(), rework: z.number().int(), hurda: z.number().int() }),
  dogrulanan: z.number().int(),
});

export type Yontem = (typeof YONTEMLER)[number];
export type KodTuru = (typeof KOD_TURLERI)[number];
export type SayacKapsami = (typeof SAYAC_KAPSAMLARI)[number];
export type BirimDurumu = (typeof BIRIM_DURUMLARI)[number];
export type BirimOlayi = (typeof BIRIM_OLAYLARI)[number];
export type DurumKomutu = (typeof DURUM_KOMUTLARI)[number];
export type AlanGovdesi = z.output<typeof alanGovdesi>;
export type MarkalamaAlani = z.output<typeof alanSemasi>;
export type MarkalamaTanimi = z.output<typeof tanimSemasi>;
export type TanimEkleGovdesi = z.output<typeof tanimEkleGovdesi>;
export type TanimKaydetGovdesi = z.output<typeof tanimKaydetGovdesi>;
export type TanimlarCevabi = z.output<typeof tanimlarCevabi>;
export type OnizlemeCevabi = z.output<typeof onizlemeCevabi>;
export type TanimEmirleriCevabi = z.output<typeof tanimEmirleriCevabi>;
export type MarkalaGovdesi = z.output<typeof markalaGovdesi>;
export type DogrulaGovdesi = z.output<typeof dogrulaGovdesi>;
export type DurumGovdesi = z.output<typeof durumGovdesi>;
export type MarkalamaBirimi = z.output<typeof birimSemasi>;
export type BirimOlayKaydi = z.output<typeof olaySemasi>;
export type BirimAyrintisi = z.output<typeof birimAyrintisiCevabi>;
export type BirimlerCevabi = z.output<typeof birimlerCevabi>;
export type EmirOzetiCevabi = z.output<typeof emirOzetiCevabi>;
