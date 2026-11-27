import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// Parça proses dosyası (3277-5 a, 3290): parçanın proses zinciri tek ekranda; düzenleme sahibi modüldedir.
// Halkaların durumu sahibin okumasından türer; NC program, takım ve bağlama halkası Proses'in kendi NC/CAM kaydındandır (3800).

const kimlik = z.coerce.number<number>().int().positive().max(2147483647);
// rev: gösterilecek teknik resim revizyon kodu; verilmezse yürürlükteki parça revizyonu, o da yoksa en son yayındaki çizim revizyonu.
export const prosesParcaSorgusu = z.object({ malzemeNo: kimlik, rev: z.string().trim().min(1).max(20).optional() });

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

/* ---------------- NC/CAM program kaydı (3800) ---------------- */

export const NC_KONTROLLERI = ['heidenhain', 'iso'] as const;
// taslak: yazılıyor; dogrulandi: ilk parçada denendi; onayli: üretimde kullanılır; eski: artık kullanılmaz (silinmez).
export const NC_DURUMLARI = ['taslak', 'dogrulandi', 'onayli', 'eski'] as const;

const kayitKimligi = z.number().int().positive().max(2147483647);
const istegeBagliMetin = (azami: number) => z.string().trim().max(azami).nullable().transform((x) => (x === '' ? null : x));
const revizyonKodu = z.string().trim().max(20).nullable().transform((x) => (x === '' ? null : x));

const ncTakimGirdisi = z.object({
  tNo: z.string().trim().toUpperCase().regex(/^T?[0-9]{1,4}$/, 'Takım numarası T ve en çok dört rakamdır (T12).')
    .transform((x) => (x.startsWith('T') ? x : `T${x}`)),
  malzemeId: kayitKimligi,
  tutucu: istegeBagliMetin(80),
  cikintiMm: z.number().positive('Çıkıntı sıfırdan büyük olmalı.').max(999_999).nullable(),
  islem: istegeBagliMetin(40),
});
const ncAparatGirdisi = z.object({ malzemeId: kayitKimligi, aciklama: istegeBagliMetin(200) });

const ncProgramAlanlari = {
  revizyonKodu,
  ad: z.string().trim().min(1, 'Program adı boş olamaz.').max(120),
  kontrol: z.enum(NC_KONTROLLERI).nullable(),
  makineId: kayitKimligi.nullable(),
  camYazilimi: istegeBagliMetin(80),
  camDosyasi: istegeBagliMetin(255),
  sifirNoktasi: istegeBagliMetin(200),
  cevrimSuresiDk: z.number().positive('Çevrim süresi sıfırdan büyük olmalı.').max(99_999).nullable(),
  durum: z.enum(NC_DURUMLARI),
  aciklama: istegeBagliMetin(500),
  takimlar: z.array(ncTakimGirdisi).max(200),
  aparatlar: z.array(ncAparatGirdisi).max(50),
};

export const ncProgramEkleGovdesi = z.object({ malzemeNo: kayitKimligi, opNo: z.number().int().positive().max(2147483647), ...ncProgramAlanlari });
export const ncProgramKaydetGovdesi = z.object({ surum: surumSemasi, ...ncProgramAlanlari });
export const ncProgramParametresi = z.object({ id: z.coerce.number<number>().int().positive().max(2147483647) });
export const ncProgramYazmaCevabi = z.object({ id: z.number().int(), surum: z.number().int() });

const kartOzeti = z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable() });

export const prosesNcProgrami = z.object({
  id: z.number().int(),
  opNo: z.number().int(),
  // null: tüm revizyonlar.
  revizyonKodu: z.string().nullable(),
  ad: z.string(),
  kontrol: z.enum(NC_KONTROLLERI).nullable(),
  makine: z.object({ id: z.number().int(), kod: z.string() }).nullable(),
  camYazilimi: z.string().nullable(),
  camDosyasi: z.string().nullable(),
  sifirNoktasi: z.string().nullable(),
  cevrimSuresiDk: ondalikMetinSemasi.nullable(),
  durum: z.enum(NC_DURUMLARI),
  aciklama: z.string().nullable(),
  surum: z.number().int(),
  guncelleme: zamanSemasi,
  takimlar: z.array(z.object({
    tNo: z.string(), kart: kartOzeti, tutucu: z.string().nullable(), cikintiMm: ondalikMetinSemasi.nullable(), islem: z.string().nullable(),
  })),
  aparatlar: z.array(z.object({ kart: kartOzeti, aciklama: z.string().nullable() })),
  // Seçili revizyona özel kayıt olmadığı için gösterilen tüm revizyonlar kaydı.
  genelYerine: z.boolean(),
});

export const prosesRevizyonu = z.object({
  kod: z.string(),
  // yururlukte: Değişiklik Yönetimi'nin yürürlükteki parça revizyonu; yayinda / eski: Belge Merkezi'ndeki çizim revizyonunun durumu.
  durum: z.enum(['yururlukte', 'yayinda', 'eski']),
});

export const prosesParcaCevabi = z.object({
  malzeme: z.object({ no: z.number().int(), kod: z.string(), ad: z.string().nullable() }),
  parcaRevizyonu: z.string().nullable(),
  rota: z.object({ revizyon: z.string(), acikTaslak: z.boolean() }).nullable(),
  halkalar: z.array(prosesHalkasi),
  operasyonlar: z.array(prosesOperasyonu),
  // Parçanın teknik resim revizyonları (yeniden eskiye); çizimi olmayan parçada boş.
  revizyonlar: z.array(prosesRevizyonu),
  // Gösterilen revizyon; revizyonu olmayan parçada null (yalnız tüm revizyonlar kayıtları).
  seciliRevizyon: z.string().nullable(),
  // Seçili revizyonda geçerli NC programları (eski olanlar dahil, sonda); operasyon sırasıyla.
  ncProgramlari: z.array(prosesNcProgrami),
});

export type ProsesHalkaAnahtari = (typeof PROSES_HALKALARI)[number];
export type ProsesHalkaDurumu = (typeof PROSES_HALKA_DURUMLARI)[number];
export type ProsesHalkasi = z.output<typeof prosesHalkasi>;
export type ProsesOperasyonu = z.output<typeof prosesOperasyonu>;
export type ProsesParcaCevabi = z.output<typeof prosesParcaCevabi>;
export type ProsesNcProgrami = z.output<typeof prosesNcProgrami>;
export type ProsesRevizyonu = z.output<typeof prosesRevizyonu>;
export type NcDurumu = (typeof NC_DURUMLARI)[number];
export type NcKontrolu = (typeof NC_KONTROLLERI)[number];
export type NcProgramEkleGovdesi = z.input<typeof ncProgramEkleGovdesi>;
export type NcProgramKaydetGovdesi = z.input<typeof ncProgramKaydetGovdesi>;
export type NcProgramYazmaCevabi = z.output<typeof ncProgramYazmaCevabi>;
