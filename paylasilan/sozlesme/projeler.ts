import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Projeler (kart #803): proje kaydı. Kod üretim emri numarasına girer ve Logo'daki proje koduyla eşleşebilecek biçimdedir.

export const PROJE_DURUMLARI = ['aktif', 'tamamlandi', 'iptal'] as const;
export const projeDurumuSemasi = z.enum(PROJE_DURUMLARI);

// PRJ-01: büyük harf, rakam, nokta, alt çizgi; en çok 24. Tire yok: emir numarasında parçaları tire ayırır.
export const PROJE_KODU_EN_COK = 24;
export const PROJE_KODU_BICIMI = /^[A-Z0-9._]{1,24}$/;
export const projeKoduSemasi = z
  .string()
  .trim()
  .min(1, 'Proje kodu zorunlu.')
  .transform((k) => k.toLocaleUpperCase('tr').replaceAll('İ', 'I'))
  .pipe(z.string().max(PROJE_KODU_EN_COK, `Proje kodu en çok ${PROJE_KODU_EN_COK} karakter olmalı.`)
    .regex(PROJE_KODU_BICIMI, 'Proje kodunda yalnız harf (A-Z), rakam, nokta ve alt çizgi olabilir.'));

// Boş ya da yalnız boşluk "yok" demektir; boş dizgi saklanmaz.
const istege = (azami: number) =>
  z.string().max(azami).nullish().transform((m) => {
    const kirpik = m?.trim();
    return kirpik ? kirpik : null;
  });

// PRJ-09: bütçeyi yalnız `finans.maliyet-oku` olan görür ve yazar; işlemi olmayanın gövdesindeki bütçe yok sayılır. Bütçe en çok iki ondalıklı, eksi olmayan tutardır; para birimi verilmezse TRY.
export const BUTCE_BICIMI = /^\d{1,16}(\.\d{1,2})?$/;
const butceAlanlari = {
  butceTutari: z.string().trim().regex(BUTCE_BICIMI, 'Bütçe en çok iki ondalıklı bir tutar olmalı (örnek: 250000.00).')
    .nullish().transform((t) => t ?? null),
  butceParaBirimi: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli koddur (TRY gibi).')
    .nullish().transform((p) => p ?? null),
};

const projeAlanlari = {
  ad: z.string().trim().min(1, 'Proje adı zorunlu.').max(200),
  firmaId: z.number().int().positive().nullish().transform((f) => f ?? null),
  baslangic: tarihSemasi.nullish().transform((t) => t ?? null),
  bitis: tarihSemasi.nullish().transform((t) => t ?? null),
  aciklama: istege(1000),
  ...butceAlanlari,
};

// PRJ-04: bitiş başlangıçtan önce olamaz (veritabanında da kısıt).
const tarihSirasi = (g: { baslangic: string | null; bitis: string | null }) => g.baslangic === null || g.bitis === null || g.bitis >= g.baslangic;
const TARIH_SIRASI = { message: 'Bitiş başlangıçtan önce olamaz.', path: ['bitis'] };

export const idParametresi = z.object({ id: z.coerce.number().int().positive() });

// Siparişten açılışta firma siparişten alınır; gövdede firma yoktur (PRJ-07, PRJ-08).
const siparistenAlanlar = {
  kod: projeKoduSemasi, ad: projeAlanlari.ad, baslangic: projeAlanlari.baslangic, bitis: projeAlanlari.bitis, aciklama: projeAlanlari.aciklama,
  ...butceAlanlari,
};
export const siparistenProjeGovdesi = z.object(siparistenAlanlar).refine(tarihSirasi, TARIH_SIRASI);
// PRJ-10 (224): yeni proje sipariş seçilmeden açılmaz; firma siparişten gelir.
export const projeOlusturGovdesi = z
  .object({
    ...siparistenAlanlar,
    siparisId: z.number({ required_error: 'Sipariş seçimi zorunlu.', invalid_type_error: 'Sipariş seçimi zorunlu.' }).int().positive().max(2147483647),
  })
  .refine(tarihSirasi, TARIH_SIRASI);
export const siparisParametresi = z.object({ siparisId: z.coerce.number().int().positive().max(2147483647) });

// Güncelleme tam kayıttır; kod yoktur (PRJ-03: açıldıktan sonra değişmez).
export const projeGuncelleGovdesi = z
  .object({ ...projeAlanlari, durum: projeDurumuSemasi, ...beklenenSurum })
  .refine(tarihSirasi, TARIH_SIRASI);

export const projeListesiSorgusu = z.object({
  ...listeSorguAlanlari(['kod', 'ad', 'baslangic']),
  ara: z.string().trim().max(80).optional(),
  durum: projeDurumuSemasi.optional(),
});

export const projeSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  durum: projeDurumuSemasi,
  firmaId: z.number().int().nullable(),
  // Firma adı finanstan okunur; bulunamazsa null (uydurulmaz).
  firmaAd: z.string().nullable(),
  // Proje siparişten açıldıysa o sipariş (176 a); elle açılan projede null.
  siparisId: z.number().int().nullable(),
  // Bütçe yalnız `finans.maliyet-oku` olana gelir (180); işlemi olmayana alan hiç gelmez. Girilmediyse null:
  // hedef o zaman plan maliyetidir (198 a).
  butceTutari: z.string().nullable().optional(),
  butceParaBirimi: z.string().nullable().optional(),
  baslangic: tarihSemasi.nullable(),
  bitis: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
  olusturma: zamanSemasi,
  guncelleme: zamanSemasi.nullable(),
  surum: surumSemasi,
});

export const projeListesiCevabi = listeCevapSemasi(projeSemasi);
export const siparisProjeleriCevabi = z.object({ projeler: z.array(projeSemasi) });

// Proje açarken sipariş seçici: yalnız onaylı siparişler, sipariş no ya da müşteri sipariş no ile aranır.
export const siparisSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).default('') });
export const siparisSecenekleriCevabi = z.object({
  siparisler: z.array(z.object({ id: z.number().int(), no: z.string(), firmaAd: z.string().nullable(), termin: tarihSemasi })),
});

export const firmaSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).default('') });
export const firmaSecenekleriCevabi = z.object({
  firmalar: z.array(z.object({ id: z.number().int(), ad: z.string(), kod: z.string().nullable() })),
});

export type ProjeDurumu = z.output<typeof projeDurumuSemasi>;
export type ProjeOlusturGovdesi = z.input<typeof projeOlusturGovdesi>;
export type ProjeOlusturVerisi = z.output<typeof projeOlusturGovdesi>;
export type SiparistenProjeGovdesi = z.input<typeof siparistenProjeGovdesi>;
export type SiparistenProjeVerisi = z.output<typeof siparistenProjeGovdesi>;
export type SiparisProjeleriCevabi = z.output<typeof siparisProjeleriCevabi>;
export type ProjeGuncelleGovdesi = z.input<typeof projeGuncelleGovdesi>;
export type ProjeGuncelleVerisi = z.output<typeof projeGuncelleGovdesi>;
export type ProjeListesiSorgusu = z.input<typeof projeListesiSorgusu>;
export type ProjeListesiSuzgeci = z.output<typeof projeListesiSorgusu>;
export type Proje = z.output<typeof projeSemasi>;
export type ProjeListesiCevabi = z.output<typeof projeListesiCevabi>;
export type SiparisSecenekleriCevabi = z.output<typeof siparisSecenekleriCevabi>;
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
