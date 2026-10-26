import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

// Teknik resim, model, balon, numune planı, numune ve ölçüm (595 1 b, 597 a, 600 a): sahibi Kalite Merkezi'dir. Arkon kalite istasyonu
// ve Hazırlık bunları okur; ölçümü ve numune kararını Kalite Merkezi'nin disari.ts komutuyla yazar.

const kimlik = z.coerce.number().int().positive().max(2147483647);
export const kmStudyoParcaParametresi = z.object({ malzemeNo: kimlik });
export const kmStudyoResimParametresi = z.object({ resimId: kimlik });
export const kmStudyoEmirParametresi = z.object({ uretimEmriId: kimlik });
export const kmStudyoNumuneParametresi = z.object({ numuneId: kimlik });

export const KM_RESIM_TURLERI = ['resim', 'model'] as const;
export const KM_BALON_YONTEMLERI = ['cmm', 'elle'] as const;
export const KM_OLCUM_KAYNAKLARI = ['operator', 'kalite', 'cmm'] as const;
export const KM_NITEL_SONUCLAR = ['gecer', 'gecmez'] as const;
export const KM_NUMUNE_KARARLARI = ['onay', 'ret', 'sapma'] as const;
export const KM_NUMUNE_DURUMLARI = ['bekliyor', 'olculuyor', 'onay', 'ret', 'sapma'] as const;

// Sayısal alanlar metin döner (numeric): yuvarlama ekranda olmaz, değer olduğu gibi gelir.
const sayiMetni = z.string().regex(/^-?\d+(\.\d+)?$/);

export const kmBalon = z.object({
  id: z.number().int(),
  no: z.number().int().positive(),
  nominal: z.string(),
  tolerans: z.string().nullable(),
  alt: sayiMetni.nullable(),
  ust: sayiMetni.nullable(),
  alet: z.string().nullable(),
  siklik: z.string().nullable(),
  kritik: z.boolean(),
  yontem: z.enum(KM_BALON_YONTEMLERI).nullable(),
  olcuAletiGerekir: z.boolean(),
  tur: z.string().nullable(),
  sayfa: z.number().int().positive().nullable(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  yaziKutusu: z.array(z.number()).length(5).nullable(),
  surum: z.number().int().positive(),
});

export const kmResim = z.object({
  id: z.number().int(),
  malzemeNo: z.number().int(),
  tur: z.enum(KM_RESIM_TURLERI),
  merkezBelgeId: z.number().int(),
  ozet: z.string(),
  ad: z.string(),
  revizyon: z.string().nullable(),
  aktif: z.boolean(),
  surum: z.number().int().positive(),
  eklendi: zamanSemasi,
  balonlar: z.array(kmBalon),
});

// Numune kuralı: ne zaman (ilk parça, her n parça, n dakikada bir, vardiya başı, son parça), kim ölçer (kalite, operatör), hangi
// balonlar (hepsi, kritikler ya da balon numaraları) ve parçanın kalite kararı beklemesi (kapı).
export const KM_NUMUNE_ZAMANLARI = ['ilk', 'her', 'sure', 'vardiya', 'son'] as const;
export const kmNumuneKurali = z.object({
  kimlik: z.string().min(1).max(40),
  ne: z.enum(KM_NUMUNE_ZAMANLARI),
  n: z.number().int().positive().max(100000).optional(),
  kim: z.array(z.enum(['kalite', 'operator'])).min(1).max(2),
  balonlar: z.union([z.literal('hepsi'), z.literal('kritik'), z.array(z.number().int().positive()).min(1).max(500)]),
  kapi: z.boolean().optional(),
}).refine((k) => (k.ne === 'her' || k.ne === 'sure') === (k.n !== undefined), 'Her n parça ve süre kuralında n verilir, ötekilerde verilmez.');
export const kmNumunePlani = z.object({ opNo: z.number().int().positive(), kurallar: z.array(kmNumuneKurali).max(50), surum: z.number().int().positive() });

export const kmStudyoParcaCevabi = z.object({ resimler: z.array(kmResim), numunePlanlari: z.array(kmNumunePlani) });
export const kmNumunePlaniCevabi = z.object({ plan: kmNumunePlani });

// Belge merkezindeki yayındaki resim ya da model parçaya alınır; aynı belgenin aynı dosyası ikinci kez alınmaz (var olan döner).
export const kmResimEkleGovdesi = z.object({
  malzemeNo: kimlik,
  merkezBelgeId: kimlik,
  revizyon: z.string().trim().min(1).max(20).nullish(),
});
export const kmResimCevabi = z.object({ resim: kmResim });
// Resim alma seçicisi: belge merkezinde yayında olan PDF ve 3B modeller (cizimler/disari.ts yayindakiBelgeler); arama belge adında.
export const KM_MERKEZ_BICIMLERI = ['pdf', 'step', 'stl', 'iges'] as const;
export const kmMerkezBelgeSorgusu = z.object({ ara: z.string().trim().max(80).optional() });
export const kmMerkezBelgesi = z.object({
  id: z.number().int().positive(), ad: z.string(), harf: z.string(), tur: z.enum(KM_RESIM_TURLERI), bicim: z.enum(KM_MERKEZ_BICIMLERI), ozet: z.string(),
});
export const kmMerkezBelgeleriCevabi = z.object({ belgeler: z.array(kmMerkezBelgesi) });
// Resim parçadan kaldırılır (pasif); balonları ve ölçümleri silinmez. Sürüm, başkasının aynı anda yaptığı değişikliği ezmemek içindir.
export const kmSurumGovdesi = z.object({ surum: z.number().int().positive().max(2147483647) });

// Kontrol planı (balonlar) resim başına bütün olarak yazılır: listede olmayan etkin balon kaldırılır (pasif), kimliği olan güncellenir,
// kimliksiz eklenir. Resmin sürümü planın sürümüdür.
const sinirGirdisi = z.string().trim().regex(/^-?\d{1,9}([.,]\d{1,6})?$/, 'Sınır en çok altı ondalıklı bir sayı olmalı.').transform((d) => d.replace(',', '.'));
const kisaMetin = (n: number) => z.string().trim().max(n).transform((m) => (m === '' ? null : m)).nullish();
const sonlu = z.number().finite();
export const kmBalonGirdisi = z.object({
  id: kimlik.optional(),
  no: z.number().int().positive().max(9999),
  nominal: z.string().trim().min(1).max(80),
  tolerans: kisaMetin(80),
  alt: sinirGirdisi.nullish(),
  ust: sinirGirdisi.nullish(),
  alet: kisaMetin(80),
  siklik: kisaMetin(80),
  kritik: z.boolean(),
  yontem: z.enum(KM_BALON_YONTEMLERI).nullish(),
  olcuAletiGerekir: z.boolean(),
  tur: kisaMetin(40),
  sayfa: z.number().int().positive().max(9999).nullish(),
  x: sonlu.nullish(),
  y: sonlu.nullish(),
  yaziKutusu: z.array(sonlu).length(5).nullish(),
});
export const kmBalonlarGovdesi = z.object({ surum: z.number().int().positive().max(2147483647), balonlar: z.array(kmBalonGirdisi).max(500) });

// Numune planı parça ve operasyon başınadır; yeni plan sürümsüz (null), var olan planın sürümüyle yazılır.
export const kmStudyoPlanParametresi = z.object({ malzemeNo: kimlik, opNo: kimlik });
export const kmNumunePlaniGovdesi = z.object({ surum: z.number().int().positive().max(2147483647).nullable(), kurallar: z.array(kmNumuneKurali).max(50) });

export const kmOlcum = z.object({
  id: z.number().int(),
  balonId: z.number().int(),
  numuneId: z.number().int().nullable(),
  deger: sayiMetni.nullable(),
  nitel: z.enum(KM_NITEL_SONUCLAR).nullable(),
  uygun: z.boolean(),
  kaynak: z.enum(KM_OLCUM_KAYNAKLARI),
  parcaSayisi: z.number().int().nonnegative().nullable(),
  kisi: z.string().nullable(),
  zaman: zamanSemasi,
});
export const kmOlcumlerCevabi = z.object({ olcumler: z.array(kmOlcum) });

// Ölçüm girişi: balon başına ya sayısal değer ya nitel sonuç. Uygunluk sunucuda balonun sınırından hesaplanır.
const olcumGirdisi = z.object({
  balonId: kimlik,
  deger: z.string().trim().regex(/^-?\d{1,9}([.,]\d{1,6})?$/, 'Değer en çok altı ondalıklı bir sayı olmalı.').transform((d) => d.replace(',', '.')).optional(),
  nitel: z.enum(KM_NITEL_SONUCLAR).optional(),
}).refine((o) => (o.deger === undefined) !== (o.nitel === undefined), 'Her ölçüde ya değer ya geçer/geçmez verilir.');
export const kmOlcumGovdesi = z.object({
  uretimEmriId: kimlik,
  numuneId: kimlik.optional(),
  parcaSayisi: z.number().int().nonnegative().max(2147483647).optional(),
  olcumler: z.array(olcumGirdisi).min(1).max(500),
});

export const kmNumune = z.object({
  id: z.number().int(),
  uretimEmriId: z.number().int(),
  opNo: z.number().int(),
  balonlar: z.array(z.number().int()),
  kritik: z.boolean(),
  neden: z.string(),
  parcaSayisi: z.number().int().nullable(),
  isteyen: z.string().nullable(),
  istendi: zamanSemasi,
  durum: z.enum(KM_NUMUNE_DURUMLARI),
  karar: z.object({ karar: z.enum(KM_NUMUNE_KARARLARI), not: z.string().nullable(), kisi: z.string().nullable(), zaman: zamanSemasi }).nullable(),
  olcumler: z.array(kmOlcum),
});
// Numune isteği: hangi emrin hangi operasyonunda hangi balonlar; neden kısa metindir (ilk parça, her 20 parça, operatör isteği).
export const kmNumuneIsteGovdesi = z.object({
  uretimEmriId: kimlik,
  opNo: kimlik,
  balonlar: z.array(kimlik).min(1).max(500),
  neden: z.string().trim().min(1).max(80),
  parcaSayisi: z.number().int().nonnegative().max(2147483647).optional(),
});
export const kmNumunelerCevabi = z.object({ numuneler: z.array(kmNumune) });
export const kmNumuneCevabi = z.object({ numune: kmNumune });
export const kmNumuneKarariGovdesi = z.object({
  karar: z.enum(KM_NUMUNE_KARARLARI),
  not: z.string().trim().min(1).max(500).nullish(),
});

export type KmBalon = z.output<typeof kmBalon>;
export type KmResim = z.output<typeof kmResim>;
export type KmNumuneKurali = z.output<typeof kmNumuneKurali>;
export type KmNumunePlani = z.output<typeof kmNumunePlani>;
export type KmStudyoParcaCevabi = z.output<typeof kmStudyoParcaCevabi>;
export type KmResimEkleGovdesi = z.input<typeof kmResimEkleGovdesi>;
export type KmMerkezBelgesi = z.output<typeof kmMerkezBelgesi>;
export type KmMerkezBelgeleriCevabi = z.output<typeof kmMerkezBelgeleriCevabi>;
export type KmBalonGirdisi = z.output<typeof kmBalonGirdisi>;
export type KmBalonlarGovdesi = z.input<typeof kmBalonlarGovdesi>;
export type KmNumunePlaniGovdesi = z.input<typeof kmNumunePlaniGovdesi>;
export type KmOlcum = z.output<typeof kmOlcum>;
export type KmOlcumlerCevabi = z.output<typeof kmOlcumlerCevabi>;
export type KmOlcumGovdesi = z.input<typeof kmOlcumGovdesi>;
export type KmOlcumVerisi = z.output<typeof kmOlcumGovdesi>;
export type KmNumune = z.output<typeof kmNumune>;
export type KmNumunelerCevabi = z.output<typeof kmNumunelerCevabi>;
export type KmNumuneKarari = (typeof KM_NUMUNE_KARARLARI)[number];
export type KmNumuneIsteGovdesi = z.input<typeof kmNumuneIsteGovdesi>;
export type KmNumuneIstegi = z.output<typeof kmNumuneIsteGovdesi>;
export type KmNumuneKarariGovdesi = z.input<typeof kmNumuneKarariGovdesi>;
export type KmOlcumKaynagi = (typeof KM_OLCUM_KAYNAKLARI)[number];
