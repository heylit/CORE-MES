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
  statuId: z.coerce.number().int().positive().max(2147483647).optional(),
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
  // 890 c: projenin son statü kaydı; hiç yazılmadıysa null.
  statu: z.lazy(() => guncelStatuSemasi).nullable(),
  // PRJ-14: iptal dışındaki görevlerin plan süresiyle ağırlıklı ilerlemesi, yüzde; görev yoksa null (sıfır uydurulmaz).
  ilerleme: z.number().int().min(0).max(100).nullable(),
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

// --- Proje yönetimi (890 c): statü, kilometre taşı, görev. Görev tutar taşımaz (911 b); plan ve gerçekleşen zaman çizelgesi planlamadadır (908). ---

// Statü rengi ortak rozet tonlarıdır; sabit renk tutulmaz.
export const STATU_TONLARI = ['tamam', 'uyari', 'hata', 'pasif', 'bilgi', 'vurgu'] as const;
export const statuTonuSemasi = z.enum(STATU_TONLARI);
export const STATU_AD_EN_COK = 80;
const zorunluMetin = (azami: number, ileti: string) => z.string().trim().min(1, ileti).max(azami, `En çok ${azami} karakter.`);

export const statuSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  ton: statuTonuSemasi,
  sira: z.number().int(),
  etkin: z.boolean(),
  surum: surumSemasi,
});
export const statuListesiCevabi = z.object({
  statuler: z.array(statuSemasi),
  // Listede olmayan statünün elle yazılmasına izin (Projeler ayarı).
  serbestStatu: z.boolean(),
  ayarSurum: surumSemasi,
});
export const statuEkleGovdesi = z.object({
  ad: zorunluMetin(STATU_AD_EN_COK, 'Statü adı zorunlu.'),
  ton: statuTonuSemasi,
  sira: z.number().int().min(0).max(10000),
});
export const statuGuncelleGovdesi = statuEkleGovdesi.extend({ etkin: z.boolean(), ...beklenenSurum });
export const statuAyariGovdesi = z.object({ serbestStatu: z.boolean(), ...beklenenSurum });

// PRJ-11: statü ya listeden seçilir ya da (izin açıksa) elle yazılır; ikisi birden olmaz.
export const statuYazGovdesi = z
  .object({
    statuId: z.number().int().positive().max(2147483647).nullish().transform((v) => v ?? null),
    metin: istege(STATU_AD_EN_COK),
    not: istege(500),
  })
  .refine((g) => (g.statuId === null) !== (g.metin === null), { message: 'Listeden bir statü seçin ya da statüyü yazın.', path: ['statuId'] });

// Güncel statü ve geçmiş satırı. Serbest yazılmış statünün tonu yoktur (ekranda gri ve kesik çerçeve).
export const guncelStatuSemasi = z.object({
  statuId: z.number().int().nullable(),
  ad: z.string(),
  ton: statuTonuSemasi.nullable(),
  serbest: z.boolean(),
  an: zamanSemasi,
});
export const statuKaydiSemasi = guncelStatuSemasi.extend({
  id: z.number().int(),
  not: z.string().nullable(),
  kisiAd: z.string().nullable(),
});

export const kilometreTasiParametresi = z.object({ tasId: z.coerce.number().int().positive().max(2147483647) });
export const kilometreTasiEkleGovdesi = z.object({
  ad: zorunluMetin(200, 'Kilometre taşı adı zorunlu.'),
  sira: z.number().int().min(0).max(10000),
  tabanTarih: tarihSemasi,
});
export const kilometreTasiGuncelleGovdesi = z.object({
  ad: zorunluMetin(200, 'Kilometre taşı adı zorunlu.'),
  sira: z.number().int().min(0).max(10000),
  gercekTarih: tarihSemasi.nullish().transform((t) => t ?? null),
  etkin: z.boolean(),
  ...beklenenSurum,
});
// PRJ-13: taban tarih yalnız gerekçeyle yenilenir; eski değer geçmişte kalır.
export const tabanYenileGovdesi = z.object({
  yeniTarih: tarihSemasi,
  gerekce: zorunluMetin(500, 'Taban tarihi neden değişiyor? Gerekçe zorunlu.'),
  ...beklenenSurum,
});
export const tabanKaydiSemasi = z.object({
  eskiTarih: tarihSemasi, yeniTarih: tarihSemasi, gerekce: z.string(), kisiAd: z.string().nullable(), an: zamanSemasi,
});
export const kilometreTasiSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  sira: z.number().int(),
  tabanTarih: tarihSemasi,
  gercekTarih: tarihSemasi.nullable(),
  etkin: z.boolean(),
  tabanGecmisi: z.array(tabanKaydiSemasi),
  surum: surumSemasi,
});

export const GOREV_DURUMLARI = ['yapilacak', 'suruyor', 'bekliyor', 'bitti', 'iptal'] as const;
export const gorevDurumuSemasi = z.enum(GOREV_DURUMLARI);
export const gorevParametresi = z.object({ gorevId: z.coerce.number().int().positive().max(2147483647) });
const kimlikYaDaYok = z.number().int().positive().max(2147483647).nullish().transform((v) => v ?? null);
const gorevPlanAlanlari = {
  kilometreTasiId: kimlikYaDaYok,
  ad: zorunluMetin(200, 'Görev adı zorunlu.'),
  aciklama: istege(1000),
  sorumluKisiId: kimlikYaDaYok,
  planBaslangic: tarihSemasi,
  planBitis: tarihSemasi,
  oncekiGorevId: kimlikYaDaYok,
};
const planSirasi = (g: { planBaslangic: string; planBitis: string }) => g.planBitis >= g.planBaslangic;
const PLAN_SIRASI = { message: 'Plan bitişi başlangıçtan önce olamaz.', path: ['planBitis'] };
export const gorevEkleGovdesi = z.object(gorevPlanAlanlari).refine(planSirasi, PLAN_SIRASI);
export const gorevGuncelleGovdesi = z
  .object({
    ...gorevPlanAlanlari,
    gercekBaslangic: tarihSemasi.nullish().transform((t) => t ?? null),
    gercekBitis: tarihSemasi.nullish().transform((t) => t ?? null),
    ilerleme: z.number().int().min(0).max(100),
    durum: gorevDurumuSemasi,
    ...beklenenSurum,
  })
  .refine(planSirasi, PLAN_SIRASI);
export const gorevSemasi = z.object({
  id: z.number().int(),
  kilometreTasiId: z.number().int().nullable(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  sorumluKisiId: z.number().int().nullable(),
  sorumluAd: z.string().nullable(),
  planBaslangic: tarihSemasi,
  planBitis: tarihSemasi,
  gercekBaslangic: tarihSemasi.nullable(),
  gercekBitis: tarihSemasi.nullable(),
  ilerleme: z.number().int(),
  durum: gorevDurumuSemasi,
  oncekiGorevId: z.number().int().nullable(),
  surum: surumSemasi,
});

// Proje ayrıntısının yönetim bölümleri tek okumada: güncel statü, geçmiş, kilometre taşları, görevler ve statü seçenekleri.
export const projeYonetimiCevabi = z.object({
  statu: guncelStatuSemasi.nullable(),
  statuGecmisi: z.array(statuKaydiSemasi),
  kilometreTaslari: z.array(kilometreTasiSemasi),
  gorevler: z.array(gorevSemasi),
  ilerleme: z.number().int().nullable(),
  // Statü penceresi için: yalnız etkin statüler ve serbest yazı izni.
  statuler: z.array(statuSemasi),
  serbestStatu: z.boolean(),
});
export const kisiSecenekleriCevabi = z.object({ kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })) });

export type StatuTonu = z.output<typeof statuTonuSemasi>;
export type Statu = z.output<typeof statuSemasi>;
export type StatuListesiCevabi = z.output<typeof statuListesiCevabi>;
export type StatuEkleGovdesi = z.input<typeof statuEkleGovdesi>;
export type StatuGuncelleGovdesi = z.input<typeof statuGuncelleGovdesi>;
export type StatuAyariGovdesi = z.input<typeof statuAyariGovdesi>;
export type StatuYazGovdesi = z.input<typeof statuYazGovdesi>;
export type StatuYazVerisi = z.output<typeof statuYazGovdesi>;
export type GuncelStatu = z.output<typeof guncelStatuSemasi>;
export type StatuKaydi = z.output<typeof statuKaydiSemasi>;
export type KilometreTasi = z.output<typeof kilometreTasiSemasi>;
export type KilometreTasiEkleGovdesi = z.input<typeof kilometreTasiEkleGovdesi>;
export type KilometreTasiGuncelleGovdesi = z.input<typeof kilometreTasiGuncelleGovdesi>;
export type KilometreTasiGuncelleVerisi = z.output<typeof kilometreTasiGuncelleGovdesi>;
export type TabanYenileGovdesi = z.input<typeof tabanYenileGovdesi>;
export type GorevDurumu = z.output<typeof gorevDurumuSemasi>;
export type Gorev = z.output<typeof gorevSemasi>;
export type GorevEkleGovdesi = z.input<typeof gorevEkleGovdesi>;
export type GorevEkleVerisi = z.output<typeof gorevEkleGovdesi>;
export type GorevGuncelleGovdesi = z.input<typeof gorevGuncelleGovdesi>;
export type GorevGuncelleVerisi = z.output<typeof gorevGuncelleGovdesi>;
export type ProjeYonetimiCevabi = z.output<typeof projeYonetimiCevabi>;
export type KisiSecenekleriCevabi = z.output<typeof kisiSecenekleriCevabi>;

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
