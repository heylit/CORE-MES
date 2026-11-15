import { z } from 'zod';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { KM_TEDARIKCI_DURUMLARI } from './kalite-merkezi.ts';

// 2466 (2461-2 a): tedarikçinin kategori başına Kalite kararı. Kategori Malzemeler ağacındaki (tür, kod) anahtarıdır (2461-4 a).
export const KM_KATEGORI_TURLERI = ['hammadde', 'sarf', 'demirbas', 'hizmet'] as const;
export type KmKategoriTuru = (typeof KM_KATEGORI_TURLERI)[number];
export const KM_KATEGORI_DURUMLARI = ['onayli', 'sartli', 'onaysiz'] as const;
export type KmKategoriDurumu = (typeof KM_KATEGORI_DURUMLARI)[number];
// 'kategori': kategori kararı. 'firma_askida' (2466-2 a): firma geneli kayıt Askıda; firmanın bütün kategorileri onaysız okunur.
export const KM_KATEGORI_KAYNAKLARI = ['kategori', 'firma_askida'] as const;
export type KmKategoriKaynagi = (typeof KM_KATEGORI_KAYNAKLARI)[number];

const firmaKimligi = z.number().int().positive().max(2147483647);
const kategoriKodu = z.string().trim().min(1).max(40);

export const kmKategoriOnayiSorgusu = z.object({ firmaId: z.coerce.number<number>().int().positive().max(2147483647) });

// Yeni kararda surum null; değiştirmede okunan sürüm. Şartlı kararın şartı yazılır.
export const kmKategoriKarariGovdesi = z.object({
  firmaId: firmaKimligi,
  kategoriTuru: z.enum(KM_KATEGORI_TURLERI),
  kategoriKodu,
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  aciklama: z.string().trim().max(500).nullable().transform((v) => (v === '' ? null : v)),
  surum: surumSemasi.nullable(),
}).refine((g) => g.durum !== 'sartli' || g.aciklama !== null, { message: 'Şartlı kararda şart yazılmalıdır.', path: ['aciklama'] });
export type KmKategoriKarariGovdesi = z.output<typeof kmKategoriKarariGovdesi>;
export const kmKategoriKarariCevabi = z.object({ surum: surumSemasi });

export const kmKategoriOnayi = z.object({
  kategoriTuru: z.enum(KM_KATEGORI_TURLERI),
  kategoriKodu: z.string(),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  kaynak: z.enum(KM_KATEGORI_KAYNAKLARI),
  tarih: zamanSemasi,
  kisiAd: z.string().nullable(),
  aciklama: z.string().nullable(),
  surum: surumSemasi,
});
export type KmKategoriOnayi = z.output<typeof kmKategoriOnayi>;

export const kmKategoriDugumu = z.object({ tur: z.enum(KM_KATEGORI_TURLERI), kod: z.string(), ad: z.string(), ustAd: z.string(), aktif: z.boolean() });
export type KmKategoriDugumu = z.output<typeof kmKategoriDugumu>;

// Ekran kararları olduğu gibi görür (kaynak hep 'kategori'); firma askısı ayrı alandadır.
export const kmKategoriOnaylariCevabi = z.object({
  firmaAskida: z.object({ tarih: zamanSemasi }).nullable(),
  onaylar: z.array(kmKategoriOnayi),
  agac: z.array(kmKategoriDugumu),
});
export type KmKategoriOnaylariCevabi = z.output<typeof kmKategoriOnaylariCevabi>;

// 3279 a: onaylı tedarikçi listesinin Kalite parçası (satın alma salt okur). Firma geneli durum 236 a kuralıyla; `adIleEslendi` kaydın firmaya
// kimlikle değil ad ya da kodla bağlandığını söyler (Risk K3: yazdırma ve CSV'de onaylı sayılmaz). Tarihler YYYY-AA-GG; yoksa null.
// Kategoriler geçerli kararlardır (askıda firmada hepsi onaysız, 2466-2 a). Denetim bulgusu, dosya ve kişi adı dönmez (Risk K2).
export const KM_KRITIKLIKLER = ['Kritik', 'Önemli', 'Standart'] as const;
export const kmOnayliListeKategorisi = z.object({
  kategoriTuru: z.enum(KM_KATEGORI_TURLERI),
  kategoriKodu: z.string(),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  aciklama: z.string().nullable(),
  tarih: zamanSemasi,
  kisiAd: z.string().nullable(),
});
// 3279-2 a: şirket dışı onaylar (müşteri onayı, adıyla diğer onay); şirket onayı yukarıdaki kategori kararlarıdır. Kapsam bütün kategoriler ya da
// en az bir kategori. Geçerlilik bitişi boşsa süresizdir; bitişi geçen onay okurken onaysız sayılır. Onay silinmez.
export const KM_ONAY_TURLERI = ['musteri', 'diger'] as const;
export type KmOnayTuru = (typeof KM_ONAY_TURLERI)[number];
export const kmOnayKapsami = z.object({ kategoriTuru: z.enum(KM_KATEGORI_TURLERI), kategoriKodu });
export const kmTedarikciOnayi = z.object({
  id: z.number().int(),
  tur: z.enum(KM_ONAY_TURLERI),
  musteriFirmaId: z.number().int().nullable(),
  musteriAd: z.string().nullable(),
  ad: z.string().nullable(),
  kapsamTumu: z.boolean(),
  kapsam: z.array(kmOnayKapsami),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  aciklama: z.string().nullable(),
  bitis: z.string().nullable(),
  belgeKimligi: z.string().nullable(),
  kisiAd: z.string().nullable(),
  tarih: zamanSemasi,
  surum: surumSemasi,
});
export type KmTedarikciOnayi = z.output<typeof kmTedarikciOnayi>;
export const kmTedarikciOnaylariCevabi = z.object({
  onaylar: z.array(kmTedarikciOnayi),
  musteriler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
});
export type KmTedarikciOnaylariCevabi = z.output<typeof kmTedarikciOnaylariCevabi>;
const kisaMetin = (en: number) => z.string().trim().max(en).nullable().transform((v) => (v === '' ? null : v));
export const kmTedarikciOnayiGovdesi = z.object({
  id: z.number().int().positive().max(2147483647).nullable(),
  firmaId: firmaKimligi,
  tur: z.enum(KM_ONAY_TURLERI),
  musteriFirmaId: firmaKimligi.nullable(),
  ad: kisaMetin(120),
  kapsamTumu: z.boolean(),
  kapsam: z.array(kmOnayKapsami).max(200),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  aciklama: kisaMetin(500),
  bitis: tarihSemasi.nullable(),
  belgeKimligi: z.string().regex(/^[A-Za-z0-9_.:@+~|-]{1,200}$/).nullable(),
  surum: surumSemasi.nullable(),
})
  .refine((g) => g.durum !== 'sartli' || g.aciklama !== null, { message: 'Şartlı onayda şart yazılmalıdır.', path: ['aciklama'] })
  .refine((g) => (g.tur === 'musteri') === (g.musteriFirmaId !== null), { message: 'Müşteri onayında müşteri seçilmelidir.', path: ['musteriFirmaId'] })
  .refine((g) => g.tur !== 'diger' || g.ad !== null, { message: 'Diğer onayın adı yazılmalıdır.', path: ['ad'] })
  .refine((g) => g.kapsamTumu || g.kapsam.length > 0, { message: 'Kapsam için en az bir kategori seçin ya da bütün kategoriler deyin.', path: ['kapsam'] })
  .refine((g) => (g.id === null) === (g.surum === null), { message: 'Yeni onayda sürüm olmaz; değiştirmede okunan sürüm gönderilir.', path: ['surum'] });
export type KmTedarikciOnayiGovdesi = z.output<typeof kmTedarikciOnayiGovdesi>;
export const kmTedarikciOnayiCevabi = z.object({ id: z.number().int(), surum: surumSemasi });

// Satın almanın okuduğu şirket dışı onay (Risk K3: belge açılmaz, yalnız var mı). `durum` geçerli hâlidir: bitişi geçen onaysız.
export const kmOnayliListeOnayi = z.object({
  tur: z.enum(KM_ONAY_TURLERI),
  musteriFirmaId: z.number().int().nullable(),
  musteriAd: z.string().nullable(),
  ad: z.string().nullable(),
  kapsamTumu: z.boolean(),
  kapsam: z.array(kmOnayKapsami),
  durum: z.enum(KM_KATEGORI_DURUMLARI),
  suresiGecti: z.boolean(),
  aciklama: z.string().nullable(),
  bitis: z.string().nullable(),
  belgeVar: z.boolean(),
});
export type KmOnayliListeOnayi = z.output<typeof kmOnayliListeOnayi>;
export const kmOnayliListeSatiri = z.object({
  durum: z.enum(KM_TEDARIKCI_DURUMLARI).nullable(),
  /** Firma askıdaysa askının zamanı; kategori kararları o an onaysız sayılır. */
  firmaAskida: zamanSemasi.nullable(),
  adIleEslendi: z.boolean(),
  kritiklik: z.enum(KM_KRITIKLIKLER).nullable(),
  sertifikalar: z.array(z.string()),
  sertifikaBitisi: z.string().nullable(),
  sonDenetim: z.string().nullable(),
  kategoriler: z.array(kmOnayliListeKategorisi),
  onaylar: z.array(kmOnayliListeOnayi),
});
export type KmOnayliListeSatiri = z.output<typeof kmOnayliListeSatiri>;
