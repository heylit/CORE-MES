import { z } from 'zod';

// Müşteri ve Tedarikçi Portalı prototipi TMI içinde değiştirilmeden çalışır. Prototip verisini belge deposunda tutar (koleksiyon ve belge
// yolları); çerçevedeki köprü prototipin depo çağrılarını bu uçlara çevirir. Belge gövdesi prototipin biçimidir ve TMI'de
// yorumlanmaz: olduğu gibi saklanır, olduğu gibi döner.

// Yol parçası: prototiplerin ürettiği kimlikler (harf, rakam, alt çizgi, tire) ve kodlanmış yerel depo anahtarları.
export const YOL_PARCASI = /^[A-Za-z0-9_.:@~+%-]{1,128}$/;
export const AZAMI_YOL = 512;
// Bir sorgunun en çok döndürdüğü belge (prototiplerin sözleşmesiyle aynı sınır).
export const AZAMI_SINIR = 1000;
// JSON gövdesi 1 MB'ı aşamaz (sunucu gövde sınırı); ek dosyası base64 ile bu sınırın altında kalmalıdır.
export const AZAMI_EK_BAYT = 700 * 1024;
export const FILTRE_ISLECLERI = ['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains'] as const;

const parcalar = (yol: string): string[] => yol.split('/');
const yolMetni = z.string().min(1).max(AZAMI_YOL).refine((y) => parcalar(y).every((p) => YOL_PARCASI.test(p)), 'Geçersiz yol.');

// Tek sayıda parça koleksiyon, çift sayıda parça belgedir.
export const koleksiyonYolu = yolMetni.refine((y) => parcalar(y).length % 2 === 1, 'Koleksiyon yolu tek sayıda parçadır.');
export const belgeYolu = yolMetni.refine((y) => parcalar(y).length % 2 === 0, 'Belge yolu çift sayıda parçadır.');

const veriSemasi = z.record(z.unknown());

export const filtreSemasi = z.object({ alan: z.string().min(1).max(200), islec: z.enum(FILTRE_ISLECLERI), deger: z.unknown() });
export const siraSemasi = z.object({ alan: z.string().min(1).max(200), yon: z.enum(['asc', 'desc']) });

// Sorgu koşulu GET parametresinde JSON metnidir.
const jsonMetni = <T extends z.ZodTypeAny>(sema: T) => z.string().max(8000).transform((metin, ctx) => {
  try {
    return JSON.parse(metin) as unknown;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Geçersiz JSON.' });
    return z.NEVER;
  }
}).pipe(sema);

export const sorguParametresi = z.object({
  koleksiyon: koleksiyonYolu,
  filtreler: jsonMetni(z.array(filtreSemasi).max(10)).optional(),
  sira: jsonMetni(siraSemasi).optional(),
  sinir: z.coerce.number().int().min(1).max(AZAMI_SINIR).optional(),
});
export const belgeParametresi = z.object({ yol: belgeYolu });

export const belgeSemasi = z.object({
  yol: z.string(),
  kimlik: z.string(),
  veri: veriSemasi,
  surum: z.number().int(),
});
export const sorguCevabi = z.object({ belgeler: z.array(belgeSemasi), damga: z.number().int() });
export const belgeCevabi = z.object({ belge: belgeSemasi.nullable(), damga: z.number().int() });

export const YAZMA_KIPLERI = ['tam', 'birlestir'] as const;
export const yazGovdesi = z.object({
  yol: belgeYolu,
  veri: veriSemasi,
  // tam: belgenin tamamını yazar (yoksa açar); birlestir: var olan belgeye iç içe birleştirir (yoksa 404).
  kip: z.enum(YAZMA_KIPLERI),
  // Verilirse yazma yalnız belge bu sürümdeyse olur (null: belge hiç yoksa). Verilmezse son yazan kazanır.
  beklenenSurum: z.number().int().nullable().optional(),
});
export const silGovdesi = z.object({ yol: belgeYolu });
export const silCevabi = z.object({ silindi: z.boolean(), damga: z.number().int() });

export const kilitGovdesi = z.object({
  yol: belgeYolu,
  sahip: z.string().min(1).max(200),
  sureMs: z.number().int().min(1).max(600_000).default(30_000),
  veri: veriSemasi.optional(),
});
export const kilitCevabi = z.object({
  alindi: z.boolean(),
  surum: z.number().int().nullable(),
  bitis: z.string().nullable(),
});

export const damgaCevabi = z.object({ damga: z.number().int() });

export const kisiSemasi = z.object({ id: z.number().int(), ad: z.string() });
export const benCevabi = z.object({
  kisi: kisiSemasi,
  yazabilir: z.boolean(),
  yonetici: z.boolean(),
  // Prototipin boş depoda açılması için gereken başlangıç belgeleri eksikse true (yönetici kurar).
  kurulumGerekli: z.boolean(),
  // Kişinin prototipteki firma kullanıcısı (`users/tmi-<kişi no>`) var mı; yoksa çerçeve açılmadan kurulur.
  portalKullanicisi: z.boolean(),
});
export const benHazirlaCevabi = z.object({ kuruldu: z.boolean() });
export const kisilerCevabi = z.object({ kisiler: z.array(kisiSemasi) });
export const kurulumCevabi = z.object({ kurulan: z.number().int() });

// Oda: o an sayfası açık olanlar (kalıcı değildir). Durum küçük düz nesnedir.
export const odaParametresi = z.object({ durum: jsonMetni(z.record(z.unknown())).optional() });
export const esSemasi = z.object({ kisiId: z.number().int(), durum: z.record(z.unknown()), guncellendi: z.number().int() });
export const odaCevabi = z.object({ esler: z.array(esSemasi) });

// Onay kararı (kart #1583): kişi, zaman ve adım rolü sunucudan gelir; gövde yalnız kararı ve notu taşır.
export const onayParametresi = z.object({ kimlik: z.string().regex(YOL_PARCASI, 'Geçersiz onay kimliği.') });
export const onayKarariGovdesi = z.object({ onay: z.boolean(), not: z.string().max(2000).default('') });

export const ekKimligi = z.string().regex(/^[0-9a-f]{32}$/, 'Geçersiz ek kimliği.');
export const ekParametresi = z.object({ id: ekKimligi });
export const ekYukleGovdesi = z.object({
  ad: z.string().trim().min(1).max(200),
  tur: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/, 'Geçersiz dosya türü.'),
  veri: z.string().min(1).max(Math.ceil(AZAMI_EK_BAYT / 3) * 4),
});
export const ekCevabi = z.object({ id: ekKimligi, ad: z.string(), tur: z.string(), boyut: z.number().int() });
export const ekIcerikCevabi = ekCevabi.extend({ veri: z.string() });

export type Belge = z.output<typeof belgeSemasi>;
export type Filtre = z.output<typeof filtreSemasi>;
export type Sira = z.output<typeof siraSemasi>;
export type SorguCevabi = z.output<typeof sorguCevabi>;
export type BelgeCevabi = z.output<typeof belgeCevabi>;
export type BenCevabi = z.output<typeof benCevabi>;
export type BenHazirlaCevabi = z.output<typeof benHazirlaCevabi>;
export type KisilerCevabi = z.output<typeof kisilerCevabi>;
export type KilitCevabi = z.output<typeof kilitCevabi>;
export type OdaCevabi = z.output<typeof odaCevabi>;
export type EkCevabi = z.output<typeof ekCevabi>;
export type EkIcerikCevabi = z.output<typeof ekIcerikCevabi>;
export type YazGovdesi = z.output<typeof yazGovdesi>;
