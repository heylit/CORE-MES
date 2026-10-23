import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari, sayfaSorguAlanlari } from '../liste.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';
import { AZAMI_OGE, rafGovdesi, yerlesimGovdesi } from './atolye.ts';
import { dosyaOzeti } from './dosya.ts';
import { KATALOG_TURLERI } from './malzemeler.ts';
import { IS_DURUMU } from './sevkiyat.ts';
import { refakatKartiCevabi } from './uretim-emirleri.ts';

// ---- Sabitler -------------------------------------------------------------------------------------------------
// Kart türleri malzemelerin sözleşmesinden okunur (sahibi malzemeler); stok kopya tutmaz.
export const MALZEME_TURLERI = KATALOG_TURLERI;
export const RAF_TURLERI = ['palet', 'celik', 'konsol', 'zemin'] as const;
export const NUMARALAMALAR = ['sirali', 'tek', 'cift'] as const;
// İstasyon konumu elle açılmaz: istasyondan kendiliğinden doğar (kart #1208).
export const KONUM_TURLERI = [
  'raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan', 'hurda', 'yolda', 'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet',
] as const;
// Kalite durumu (134 a): rota statüsünün yanında ikinci eksen. Kullanılabilir stok serbest ya da şartlıdır; karar bekleyen ve red parça
// üretimde uyarıyla ilerler, rezerveye girmez (135). Yanıtta alan yoksa serbesttir.
export const KALITE_DURUMLARI = ['serbest', 'karar_bekliyor', 'sartli', 'red'] as const;
export type KaliteDurumu = (typeof KALITE_DURUMLARI)[number];
export const ELLE_KONUM_TURLERI = ['kabul', 'depo_zemini', 'fason', 'ara_alan', 'hurda'] as const;
export const MAL_KABUL_TURLERI = ['satin_alma', 'iade', 'diger'] as const;
export const CIKIS_NEDENLERI = ['uretime_sarf', 'sevk', 'fire', 'numune', 'diger'] as const;
export const AMBALAJ_TURLERI = ['kasa', 'koli', 'palet', 'bidon', 'makara'] as const;
export const HAREKET_TURLERI = ['giris', 'cikis', 'transfer', 'sayim_fazla', 'sayim_eksik', 'geri_alma'] as const;
export const LOGO_ESLESME_DURUMLARI = ['irsaliye_bekleniyor', 'eslesti', 'fark_var'] as const;
export const STOK_DURUMLARI = ['kritik', 'eksi', 'kabulde'] as const;

export type MalzemeTuru = (typeof MALZEME_TURLERI)[number];
export type KonumTuru = (typeof KONUM_TURLERI)[number];
export type HareketTuru = (typeof HAREKET_TURLERI)[number];
export type LogoEslesmeDurumu = (typeof LOGO_ESLESME_DURUMLARI)[number];
export type MalKabulTuru = (typeof MAL_KABUL_TURLERI)[number];
export type AmbalajTuru = (typeof AMBALAJ_TURLERI)[number];
export type CikisNedeni = (typeof CIKIS_NEDENLERI)[number];
export type RafTuru = (typeof RAF_TURLERI)[number];
export type Numaralama = (typeof NUMARALAMALAR)[number];
export type StokDurumuSuzgeci = (typeof STOK_DURUMLARI)[number];
export type ElleKonumTuru = (typeof ELLE_KONUM_TURLERI)[number];

// ---- Alan şemaları --------------------------------------------------------------------------------------------
const kimlik = z.coerce.number().int().min(1).max(2147483647);
const buyukKimlik = z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
// Miktar metin taşınır (numeric(14,3)); en çok üç ondalık, en çok on bir tam basamak.
const MIKTAR = /^\d{1,11}(\.\d{1,3})?$/;
export const miktarSemasi = z.string().trim().regex(MIKTAR, 'Miktar en çok üç ondalıklı bir sayı olmalı (örnek: 12.5).')
  .refine((v) => /[1-9]/.test(v), 'Miktar sıfırdan büyük olmalı.');
export const sifirOlabilirMiktar = z.string().trim().regex(MIKTAR, 'Miktar en çok üç ondalıklı bir sayı olmalı (örnek: 12.5).');
const kisaMetin = (en: number) => z.string().trim().min(1).max(en);
const bosOlabilir = (en: number) => z.string().trim().max(en).transform((v) => (v === '' ? null : v)).nullable().optional();
const KOD = /^[A-Z0-9-]{2,20}$/;
const olcuM = z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Ölçü metre olarak, en çok iki ondalıkla yazılır.')
  .refine((v) => /[1-9]/.test(v), 'Ölçü sıfırdan büyük olmalı.');

export const kimlikParametresi = z.object({ id: kimlik });
export type KimlikParametresi = z.output<typeof kimlikParametresi>;

const ambalajGirdisi = z.object({
  tur: z.enum(AMBALAJ_TURLERI),
  olcu: z.string().trim().regex(/^[a-z0-9]{1,8}$/, 'Ambalaj ölçü kodu küçük harf ve rakamdır.'),
  ozelOlcu: z.object({ uzunlukCm: olcuM, genislikCm: olcuM, yukseklikCm: olcuM }).nullable().optional(),
  adet: z.number().int().min(1).max(100000).nullable().optional(),
}).refine((a) => (a.olcu === 'ozel') === Boolean(a.ozelOlcu), { message: 'Özel ölçüde üç ölçü girilir; hazır ölçüde girilmez.', path: ['ozelOlcu'] });

const partiGirdisi = z.object({
  tedarikciPartiNo: bosOlabilir(40),
  dokumNo: bosOlabilir(40),
  sertifikaNo: bosOlabilir(40),
});
export type PartiGirdisi = z.output<typeof partiGirdisi>;

// ---- Ortak satır şemaları -------------------------------------------------------------------------------------
const ambalaj = z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string(), adet: z.number().int().nullable() }).nullable();

export const bakiyeSatiri = z.object({
  id: z.number().int(),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  konumId: z.number().int(),
  konumKod: z.string(),
  partiId: z.number().int().nullable(),
  partiEtiketi: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  ilkGiris: zamanSemasi,
  ambalaj,
  // Reçete ve Rota statüsü (#1108); null serbest stoktur. Ad ve renk istemcide `GET /recete-rota/statuler`'dan.
  statuId: z.number().int().nullable(),
  kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(),
  // DEP-63: konumun yerdeki karesi Fabrika Haritası ızgarasından ("DEPO1 C4", kart #1304); raftaki malzemenin de karesi vardır. Ayrıntı
  // ekranlarında gelir; haritada yeri olmayan konumda null.
  zemin: z.string().nullable().optional(),
});
export type BakiyeSatiri = z.output<typeof bakiyeSatiri>;

export const konum = z.object({
  id: z.number().int(),
  kod: z.string(),
  tur: z.enum(KONUM_TURLERI),
  ad: z.string().nullable(),
  depoId: z.number().int(),
  depoKod: z.string(),
  rafId: z.number().int().nullable(),
  bolmeNo: z.number().int().nullable(),
  katNo: z.number().int().nullable(),
  sonSayim: zamanSemasi.nullable(),
  aktif: z.boolean(),
  satirSayisi: z.number().int(),
  // Fabrika Haritası bağı (#686): raf gözü göze, öteki konum zemin alanına bağlıdır; ikisi de boşsa haritada yoktur.
  haritaGozId: z.number().int().nullable(),
  haritaAlanId: z.number().int().nullable(),
  surum: surumSemasi,
});
export type Konum = z.output<typeof konum>;

export const raf = z.object({
  id: z.number().int(),
  depoId: z.number().int(),
  kod: z.string(),
  tur: z.enum(RAF_TURLERI),
  numaralama: z.enum(NUMARALAMALAR),
  ilkBolme: z.number().int(),
  bolmeSayisi: z.number().int(),
  katSayisi: z.number().int(),
  bolmeGenislikM: ondalikMetinSemasi,
  derinlikM: ondalikMetinSemasi,
  katAraligiM: ondalikMetinSemasi,
  aktif: z.boolean(),
  doluGoz: z.number().int(),
  toplamGoz: z.number().int(),
  surum: surumSemasi,
});
export type Raf = z.output<typeof raf>;

export const hareket = z.object({
  id: z.number().int(),
  zaman: zamanSemasi,
  tur: z.enum(HAREKET_TURLERI),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  partiId: z.number().int().nullable(),
  partiEtiketi: z.string().nullable(),
  kaynakKonumKod: z.string().nullable(),
  hedefKonumKod: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  onayliEksi: z.boolean(),
  girisKaynagi: z.enum(['mal_kabul', 'uretim']).nullable(),
  cikisNedeni: z.enum(CIKIS_NEDENLERI).nullable(),
  uretimEmriId: z.number().int().nullable(),
  // Başka modülün hareket fikstürleri alanı bilmez; sunucu her zaman doldurur (numara bulunamazsa null).
  emirNo: z.string().nullable().optional(),
  geriAlinanId: z.number().int().nullable(),
  geriAlindi: z.boolean(),
  fisId: z.number().int().nullable(),
  fisNo: z.string().nullable(),
  kisiAd: z.string().nullable(),
  aciklama: z.string().nullable(),
  kaynakStatuId: z.number().int().nullable(),
  hedefStatuId: z.number().int().nullable(),
  kaynakKaliteDurumu: z.enum(KALITE_DURUMLARI).nullable().optional(),
  hedefKaliteDurumu: z.enum(KALITE_DURUMLARI).nullable().optional(),
});
export type Hareket = z.output<typeof hareket>;

// ---- İş kutusu ve menü sayaçları -------------------------------------------------------------------------------
// Veri yoksa null: sayım süresi tanımlı değilse sayım bekleyen sayılmaz (DEP-15).
export const isKutusuCevabi = z.object({
  kabuldeBekleyen: z.number().int(),
  eksiBakiye: z.number().int(),
  kritik: z.number().int(),
  sayimBekleyen: z.number().int().nullable(),
  logoFarki: z.number().int(),
  logoHatasi: z.number().int(),
  // Kapanmış emrin fason firmasında (yolda ya da firmada) kalan parçası: gönderilen, dönen ve hurda tutmuyor (kart #1310).
  fasondaEksik: z.number().int(),
  // Sunucu doldurana kadar isteğe bağlı: alanı henüz göndermeyen cevap sözleşmeden düşmesin. Doldurulunca zorunlu olur.
  fasonEksikGonderimi: z.number().int(),
  // Teslimi bekleyen malzeme isteği (açık ya da stok yok, yolda teslimi yok); depo işlemi olmayana null.
  teslimBekleyenIstek: z.number().int().nullable().optional(),
});
export type IsKutusuCevabi = z.output<typeof isKutusuCevabi>;
// Rol panosu kartları: her sayı kendi işlemiyle görünür; yetkisi olmayana null (kart çizilmez).
export const stokOzetiCevabi = z.object({
  acikIstek: z.number().int().nullable(),
  dusukStok: z.number().int().nullable(),
  sayimBekleyen: z.number().int().nullable(),
  eksikEmir: z.number().int().nullable(),
});
export type StokOzetiCevabi = z.output<typeof stokOzetiCevabi>;


// ---- Depo, konum, raf ---------------------------------------------------------------------------------------------
export const depolarCevabi = z.object({ depolar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string(), logoAmbarNo: z.number().int().nullable() })) });
export type DepolarCevabi = z.output<typeof depolarCevabi>;

export const konumlarSorgusu = z.object({
  ...listeSorguAlanlari(['kod', 'tur']),
  tur: z.enum(KONUM_TURLERI).optional(),
  rafId: kimlik.optional(),
  metin: z.string().trim().max(40).optional(),
});
export type KonumlarSorgusu = z.input<typeof konumlarSorgusu>;
export const konumlarCevabi = listeCevapSemasi(konum);
export type KonumlarCevabi = z.output<typeof konumlarCevabi>;
export const gozOlcusu = z.object({ tur: z.enum(RAF_TURLERI), bolmeGenislikM: ondalikMetinSemasi, derinlikM: ondalikMetinSemasi, katAraligiM: ondalikMetinSemasi });
export type GozOlcusu = z.output<typeof gozOlcusu>;
// haritaYeri: bağlı gözün adresi (A12-03-2-1) ya da alanın adı; bağ yoksa null.
export const konumAyrintiCevabi = z.object({ konum, raf: gozOlcusu.nullable(), bakiyeler: z.array(bakiyeSatiri), haritaYeri: z.string().nullable(), zemin: z.string().nullable() });
export type KonumAyrintiCevabi = z.output<typeof konumAyrintiCevabi>;
export const konumCevabi = z.object({ konum });
// Kodu değişen açık konum (94 a): eski etiketin QR'ı artık okunmaz; ekran yeniden basmayı önerir.
export const koduDegisenKonum = z.object({
  konumId: z.number().int(), eskiKod: z.string(), yeniKod: z.string(), tur: z.enum(KONUM_TURLERI), ad: z.string().nullable(),
  bolmeNo: z.number().int().nullable(), katNo: z.number().int().nullable(),
});
export type KoduDegisenKonum = z.output<typeof koduDegisenKonum>;
export const konumDuzenleCevabi = z.object({ konum, koduDegisenler: z.array(koduDegisenKonum) });
export type KonumDuzenleCevabi = z.output<typeof konumDuzenleCevabi>;

export const konumAcGovdesi = z.object({
  tur: z.enum(ELLE_KONUM_TURLERI),
  kod: z.string().trim().toUpperCase().regex(KOD, 'Konum kodu 2-20 büyük harf, rakam ya da tire olmalı.'),
  ad: bosOlabilir(60),
  depoId: kimlik.optional(),
});
export type KonumAcGovdesi = z.input<typeof konumAcGovdesi>;
export const konumDuzenleGovdesi = z.object({
  ...beklenenSurum,
  kod: z.string().trim().toUpperCase().regex(KOD, 'Konum kodu 2-20 büyük harf, rakam ya da tire olmalı.'),
  ad: bosOlabilir(60),
  // Yalnız elle açılan, haritaya bağlı olmayan, boş konumun türü değişir (DEP-62).
  tur: z.enum(ELLE_KONUM_TURLERI).optional(),
});
export type KonumDuzenleGovdesi = z.input<typeof konumDuzenleGovdesi>;
// Fabrika Haritası eşlemesi (kart #686): haritadaki göz ve stok alanları stok konumu olur; haritada silinen göz konumu kapanır.
export const haritaEslemeCevabi = z.object({
  eklenen: z.number().int(), guncellenen: z.number().int(), kapatilan: z.number().int(),
  // Kodu başka konumda olan ya da stoğu olduğu için kapatılamayan yerlerin adresi.
  atlanan: z.array(z.string()),
  koduDegisenler: z.array(koduDegisenKonum),
});
export type HaritaEslemeCevabi = z.output<typeof haritaEslemeCevabi>;
// Eşleme özeti (#711): bağlı bölüm, göz ve alan sayısı; haritada olup stokta konumu olmayan yer; haritada karşılığı olmayan açık konumlar.
export const haritaOzetiCevabi = z.object({
  bolum: z.number().int(), goz: z.number().int(), alan: z.number().int(), eslenmemis: z.number().int(),
  bagsizKonumlar: z.array(z.object({ id: z.number().int(), kod: z.string(), tur: z.enum(KONUM_TURLERI), satirSayisi: z.number().int() })),
  // Haritadaki bölümler; depoKod doluysa bölüm stok deposudur (yalnız onun gözleri konum olur).
  bolumler: z.array(z.object({ salonId: z.number().int(), kod: z.string(), gozSayisi: z.number().int(), depoKod: z.string().nullable() })),
});
// Depo bölümünün raf kaydı (kart #1304): yalnız raflar; sürüm bölümün yerleşim sürümüdür.
export const depoRaflariGovdesi = z.object({ surum: yerlesimGovdesi.shape.surum, raflar: z.array(rafGovdesi).max(AZAMI_OGE) });
export type DepoRaflariGovdesi = z.input<typeof depoRaflariGovdesi>;
// Fabrika Haritası göz paneli (#711): istemci bu uçtan okur (atölye stok/disari.ts'i ithal edemez, döngü). Stoksuz göz cevapta yoktur.
export const gozStoklariSorgusu = z.object({ gozIdler: z.string().regex(/^\d+(,\d+){0,499}$/).transform((m) => [...new Set(m.split(',').map(Number))]) });
export const gozStoklariCevabi = z.object({
  gozler: z.array(z.object({ gozId: z.number().int(), konumId: z.number().int(), kalemSayisi: z.number().int(), ilkMalzemeAd: z.string().nullable() })),
});
export type GozStoklariCevabi = z.output<typeof gozStoklariCevabi>;
export const bolumDeposuGovdesi = z.object({ depo: z.boolean() });
export type BolumDeposuGovdesi = z.input<typeof bolumDeposuGovdesi>;
export type HaritaOzetiCevabi = z.output<typeof haritaOzetiCevabi>;
export const surumGovdesi = z.object({ ...beklenenSurum });

export const raflarSorgusu = z.object({ ...listeSorguAlanlari(['kod']), tur: z.enum(RAF_TURLERI).optional(), metin: z.string().trim().max(10).optional() });
export type RaflarSorgusu = z.input<typeof raflarSorgusu>;
export const raflarCevabi = listeCevapSemasi(raf);
export type RaflarCevabi = z.output<typeof raflarCevabi>;
export const gozHucresi = z.object({
  konumId: z.number().int(),
  kod: z.string(),
  bolmeNo: z.number().int(),
  katNo: z.number().int(),
  aktif: z.boolean(),
  satirSayisi: z.number().int(),
  ilkMalzemeAd: z.string().nullable(),
  ilkMiktar: ondalikMetinSemasi.nullable(),
  sonSayim: zamanSemasi.nullable(),
  ambalajlar: z.array(z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string(), adet: z.number().int().nullable() })),
});
export type GozHucresi = z.output<typeof gozHucresi>;
export const rafMatrisiCevabi = z.object({ raf, gozler: z.array(gozHucresi) });
export type RafMatrisiCevabi = z.output<typeof rafMatrisiCevabi>;
export const rafCevabi = z.object({ raf });
export const rafDuzenleCevabi = z.object({ raf, koduDegisenler: z.array(koduDegisenKonum) });
export type RafDuzenleCevabi = z.output<typeof rafDuzenleCevabi>;

const rafAlanlari = {
  kod: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, 'Raf kodu 1-3 büyük harf ya da rakam olmalı.'),
  tur: z.enum(RAF_TURLERI),
  numaralama: z.enum(NUMARALAMALAR),
  ilkBolme: z.number().int().min(1).max(999).default(1),
  bolmeSayisi: z.number().int().min(1).max(80),
  katSayisi: z.number().int().min(1).max(10),
  bolmeGenislikM: olcuM,
  derinlikM: olcuM,
  katAraligiM: olcuM,
};
export const rafAcGovdesi = z.object({ ...rafAlanlari, depoId: kimlik.optional() });
export type RafAcGovdesi = z.input<typeof rafAcGovdesi>;
export const rafDuzenleGovdesi = z.object({ ...beklenenSurum, ...rafAlanlari });
export type RafDuzenleGovdesi = z.input<typeof rafDuzenleGovdesi>;

// ---- Malzeme gözüyle stok -----------------------------------------------------------------------------------------
// Kart özeti malzemeler/disari.ts'ten gelir (kimlik kartın sayı kimliği `no`); ad ve birim kartta yoksa null (birim uydurulmaz).
export const malzemeOzetiCevabi = z.object({
  ozet: z.object({
    id: z.number().int(),
    tur: z.enum(MALZEME_TURLERI),
    kod: z.string(),
    ad: z.string().nullable(),
    onayDurumu: z.string(),
    kullanilabilir: z.boolean(),
    birim: z.string().nullable(),
  }),
});
export type MalzemeOzetiCevabi = z.output<typeof malzemeOzetiCevabi>;

export const malzemeStokSatiri = z.object({
  malzemeId: z.number().int(),
  ad: z.string().nullable(),
  stokKodu: z.string().nullable(),
  tur: z.enum(MALZEME_TURLERI).nullable(),
  birim: z.string().nullable(),
  toplam: ondalikMetinSemasi,
  // Statüsüz (kullanılabilir) miktar; toplamdan farkı üretimde statü almış yarı parçadır. Durum serbest miktara göredir.
  serbest: ondalikMetinSemasi,
  // Statüdeki malzemeden açık üretim emirlerine ayrılan (rezerve); statüdekinin parçasıdır.
  rezerve: ondalikMetinSemasi,
  kritikSeviye: ondalikMetinSemasi.nullable(),
  durum: z.enum(['yeterli', 'kritik', 'eksi', 'tanimsiz']),
  konumSayisi: z.number().int(),
  // En çok miktarlı üç konum (ekranda raf etiketi); kat raf gözü değilse null.
  konumlar: z.array(z.object({ kod: z.string(), katNo: z.number().int().nullable(), miktar: ondalikMetinSemasi })),
});
export type MalzemeStokSatiri = z.output<typeof malzemeStokSatiri>;
// metin: kart adı ya da stok kodu (malzemeler `malzemeAra`), konum kodu, parti no ya da kart numarası.
export const malzemelerSorgusu = z.object({
  ...listeSorguAlanlari(['malzeme', 'toplam']),
  durum: z.enum(STOK_DURUMLARI).optional(),
  metin: z.string().trim().max(40).optional(),
  // 'kartlar': stoğu olmayanlar dahil bütün stoklanır malzeme kartları (#680); durum süzgeci ve sıralama uygulanmaz.
  kapsam: z.enum(['kartlar']).optional(),
});
export type MalzemelerSorgusu = z.input<typeof malzemelerSorgusu>;
export const malzemelerCevabi = listeCevapSemasi(malzemeStokSatiri);
export type MalzemelerCevabi = z.output<typeof malzemelerCevabi>;

export const malzemeAmbalaji = z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string(), iciMiktar: ondalikMetinSemasi });
export const malzemeAyrintiCevabi = z.object({
  satir: malzemeStokSatiri,
  bakiyeler: z.array(bakiyeSatiri),
  // Toplam stoğun statü kırılımı (#1108): önce serbest (statuId null), sonra statüler kimlik sırasıyla; stoğu olmayan statü yok.
  statuKirilimi: z.array(z.object({ statuId: z.number().int().nullable(), miktar: ondalikMetinSemasi, ilkGiris: zamanSemasi })),
  // Statüdeki malzemenin açık üretim emirlerine ayrılanı (rezerve); ayrılmayan statülü kısmı aynı ürün + OP'nin herhangi bir emri kullanır.
  rezerveler: z.lazy(() => rezerveSatirlari),
  // Açılışta "Stoktan rezerve et" denen ve bu malzemeden ayrılanı ihtiyacına yetmeyen açık emirler, ayrılma sırasıyla (mal kabulde gelen
  // malzeme bu sırayla ayrılır).
  bekleyenler: z.array(z.object({ uretimEmriId: z.number().int(), emirNo: z.string(), miktar: ondalikMetinSemasi })),
  ayar: z.object({
    kritikSeviye: ondalikMetinSemasi.nullable(),
    varsayilanAmbalaj: z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string() }).nullable(),
    // DEP-59 (A7, #516): malzeme kartındaki depo yerinin esası.
    varsayilanKonum: z.object({ id: z.number().int(), kod: z.string() }).nullable(),
    ambalajlar: z.array(malzemeAmbalaji),
    surum: surumSemasi.nullable(),
  }),
  sonHareketler: z.array(hareket),
});
export type MalzemeAyrintiCevabi = z.output<typeof malzemeAyrintiCevabi>;

export const malzemeAyarGovdesi = z.object({
  surum: surumSemasi.nullable(),
  kritikSeviye: sifirOlabilirMiktar.nullable(),
  varsayilanAmbalaj: z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string().trim().regex(/^[a-z0-9]{1,8}$/) }).nullable(),
  varsayilanKonumId: kimlik.nullable().default(null),
  ambalajlar: z.array(z.object({ tur: z.enum(AMBALAJ_TURLERI), olcu: z.string().trim().regex(/^[a-z0-9]{1,8}$/), iciMiktar: miktarSemasi })).max(20),
});
export type MalzemeAyarGovdesi = z.input<typeof malzemeAyarGovdesi>;

export const cikisOnerisiSorgusu = z.object({ miktar: miktarSemasi });
// Kullanılabilir bakiye yoksa `veriYetersiz` (DEP-08): göz ya da miktar uydurulmaz.
export const cikisOnerisiCevabi = z.object({
  veriYetersiz: z.boolean(),
  yeterli: z.boolean(),
  mevcut: ondalikMetinSemasi,
  oneriler: z.array(z.object({ bakiyeId: z.number().int(), konumId: z.number().int(), konumKod: z.string(), partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(), miktar: ondalikMetinSemasi })),
});
export type CikisOnerisiCevabi = z.output<typeof cikisOnerisiCevabi>;

// Mal kabulde göz önerisi (DEP-34): malzemenin bulunduğu göz, yoksa kolay kattaki boş göz; ikisi de yoksa null (veri yetersiz).
export const gozOnerisiCevabi = z.object({ oneri: z.object({ konumId: z.number().int(), kod: z.string() }).nullable() });
export type GozOnerisiCevabi = z.output<typeof gozOnerisiCevabi>;

// ---- Panel (İş kutusunun gösterge ve özet bölümleri) ------------------------------------------------------------------
// Stok değeri yok: birim maliyet stokta tutulmaz (satın almadan gelecek); sayı uydurulmaz.
export const panelCevabi = z.object({
  malzemeCesidi: z.number().int(),
  gozDolu: z.number().int(),
  gozToplam: z.number().int(),
  kritik: z.number().int(),
  eksi: z.number().int(),
  kabulde: z.number().int(),
  // Açık (topluyor) toplama listesi sayısı.
  toplamaBekleyen: z.number().int(),
  gunluk: z.array(z.object({ gun: z.string(), giris: z.number().int(), cikis: z.number().int() })),
  kritikListe: z.array(z.object({ malzemeId: z.number().int(), ad: z.string().nullable(), kod: z.string().nullable(), toplam: ondalikMetinSemasi, kritikSeviye: ondalikMetinSemasi })),
  raflar: z.array(z.object({ rafId: z.number().int(), kod: z.string(), tur: z.enum(RAF_TURLERI), dolu: z.number().int(), toplam: z.number().int() })),
  sonHareketler: z.array(hareket),
  // Ağırlıklı ortalama alış fiyatıyla TRY (#544). Fiyatlı stoklu kart yoksa null; fiyatı olmayan stoklu kartlar değere katılmaz, sayılır.
  stokDegeri: ondalikMetinSemasi.nullable(),
  fiyatsizKart: z.number().int(),
  // Güncel değer: eldeki miktar x satın almanın kg fiyatından birim fiyatı (TRY). Birim fiyatı olmayan kart (kalitesi fiyatsız ya da
  // kg ağırlığı bilinmiyor) değere katılmaz, sayılır; hiçbiri fiyatlı değilse null.
  guncelDeger: ondalikMetinSemasi.nullable(),
  guncelFiyatsizKart: z.number().int(),
  // 228 a: güncel değer ve fiyatsız sayısı yalnız kullanılabilir stoktandır (raf, kabul, zemin; statüsüz; serbest ya da şartlı). Kalite
  // bekleyen ve red (karantina dahil), hurda, fason, yolda (sevkiyat dahil) ve diğer (üretimde, ara alan) aynı fiyatla ayrı değerlenir;
  // toplam bütün stoktur. Fiyatlı kart yoksa null.
  guncelAyri: z.object({
    kalite: ondalikMetinSemasi.nullable(), hurda: ondalikMetinSemasi.nullable(), fason: ondalikMetinSemasi.nullable(),
    yolda: ondalikMetinSemasi.nullable(), diger: ondalikMetinSemasi.nullable(), toplam: ondalikMetinSemasi.nullable(),
  }),
  // Değer yalnız finans rakamlarını görene (finans.oku) hesaplanır ve gösterilir; değilse false, değer null, sayı 0 (#680).
  degerGorunur: z.boolean(),
});
export type PanelCevabi = z.output<typeof panelCevabi>;
// Yönetici paneli (#1079): son `ay` ayın ay sonu stok değeri, eskiden yeniye; içinde bulunulan ayın noktası bugündür.
// Ay sonu miktarı bugünkü bakiyeden sonraki hareketler geri sarılarak bulunur; fiyat bugünkü ağırlıklı ortalama alış fiyatıdır
// (geçmiş fiyat tutulmaz). Seri panel gibi yalnız finans.oku görene hesaplanır; değilse degerGorunur false, aylar boş.
export const aylikStokDegeriSorgusu = z.object({ ay: z.coerce.number().int().min(1).max(24).default(12) });
export const aylikStokDegeriCevabi = z.object({
  degerGorunur: z.boolean(),
  aylar: z.array(z.object({ ay: z.string().regex(/^\d{4}-\d{2}$/), stokDegeri: ondalikMetinSemasi.nullable(), fiyatsizKart: z.number().int() })),
});
export type AylikStokDegeriCevabi = z.output<typeof aylikStokDegeriCevabi>;

// ---- Parti -------------------------------------------------------------------------------------------------------------
export const parti = z.object({
  id: z.number().int(),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  lotNo: z.string(),
  tedarikciPartiNo: z.string().nullable(),
  dokumNo: z.string().nullable(),
  sertifikaNo: z.string().nullable(),
  uretimEmriId: z.number().int().nullable(),
  kayitZamani: zamanSemasi,
  eldeki: ondalikMetinSemasi,
});
export type Parti = z.output<typeof parti>;
export const partilerSorgusu = z.object({
  ...listeSorguAlanlari(['kayitZamani', 'partiNo']),
  malzemeId: kimlik.optional(),
  metin: z.string().trim().max(40).optional(),
});
export type PartilerSorgusu = z.input<typeof partilerSorgusu>;
export const partilerCevabi = listeCevapSemasi(parti);
export type PartilerCevabi = z.output<typeof partilerCevabi>;
// İleri izlenebilirlik (E-12): partinin emirlerini taşıyan iptal edilmemiş sevk işleri; müşteri işin bırakış noktasının firmasıdır.
export const partiSevki = z.object({
  emirId: z.number().int(),
  isId: z.number().int(),
  gun: z.string(),
  durum: IS_DURUMU,
  adet: ondalikMetinSemasi.nullable(),
  firmaId: z.number().int().nullable(),
  firmaAdi: z.string().nullable(),
});
export type PartiSevki = z.output<typeof partiSevki>;
export const partiIziCevabi = z.object({ parti, hareketler: z.array(hareket), emirler: z.array(z.number().int()), sevkler: z.array(partiSevki) });
export type PartiIziCevabi = z.output<typeof partiIziCevabi>;
// Partiye bağlı belge (Çizim merkezi kaydı); dosya stok'un `/stok/partiler/:id/belgeler/:belgeId` ucundan açılır.
export const partiBelgesi = z.object({ id: z.number().int(), ad: z.string(), tur: z.string(), harf: z.string().nullable() });
export type PartiBelgesi = z.output<typeof partiBelgesi>;
export const partiBelgeParametresi = z.object({ id: buyukKimlik, belgeId: kimlik });
// Kartın son partileri ve bağlı sertifikaları (#960, #1001); satın alma da okur (Malzemeler'de hammadde sertifikası).
export const sonPartilerSorgusu = z.object({ sinir: z.coerce.number().int().min(1).max(50).default(10) });
export type SonPartilerSorgusu = z.input<typeof sonPartilerSorgusu>;
export const sonParti = z.object({
  partiId: z.number().int(),
  lotNo: z.string(),
  tedarikciPartiNo: z.string().nullable(),
  dokumNo: z.string().nullable(),
  sertifikaNo: z.string().nullable(),
  kayitZamani: zamanSemasi,
  belgeler: z.array(partiBelgesi),
});
export type SonParti = z.output<typeof sonParti>;
export const sonPartilerCevabi = z.object({ partiler: z.array(sonParti) });
export type SonPartilerCevabi = z.output<typeof sonPartilerCevabi>;

// ---- Mal kabul ve üretim girişi ------------------------------------------------------------------------------------
const malKabulSatirGirdisi = z.object({
  malzemeId: kimlik,
  miktar: miktarSemasi,
  konumId: kimlik.optional(),
  partiId: buyukKimlik.optional(),
  parti: partiGirdisi.nullable().optional(),
  ambalaj: ambalajGirdisi.nullable().optional(),
  siparisSatirId: kimlik.optional(),
  // Fasondan dönüş (K-080 c): sipariş satırı hizmet kartınınsa satırın kartı dönen yarı mamuldür; giden fason konumundan düşer.
  // Miktar verilmezse dönen miktar kadardır.
  fason: z.object({ malzemeId: kimlik, konumId: kimlik, partiId: buyukKimlik.nullable().optional(), miktar: miktarSemasi.optional() }).optional(),
  // Girdili emirde fason işinden dönüş (kart #1289): satırın kartı rotaya göre dönen karttır, miktarı dönen adettir; giden işin
  // yarı parçasıdır (firmadan düşer). `fason` ile birlikte verilmez.
  // Dönüş kaydı da buradan yazılır (kullanıcı kararı 15.10 B): miktar sağlam adettir, hurda ayrıca verilir ve firmadan düşer.
  fasonIsi: z.object({ isEmriId: kimlik, hurdaAdet: z.coerce.number().int().min(0).max(1_000_000).optional() }).optional(),
  // Parti sertifikası (#960): dosya önce `/dosyalar` ile yüklenir; mal kabul belgeyi açar ve satırın partisine bağlar.
  sertifika: z.object({ ozet: dosyaOzeti, dosyaAdi: z.string().trim().min(1, 'Dosya adı zorunlu.').max(120) }).optional(),
});
export type MalKabulSatirGirdisi = z.input<typeof malKabulSatirGirdisi>;
// Mal kabulün fason kutusundaki açık fason işleri (kart #1289): rotaya göre dönecek kart; statülüyse yarı parça adımın statüsüne geçer.
export const fasonIsleriSorgusu = z.object({ konumId: kimlik });
export const fasonIsleriCevabi = z.object({
  isler: z.array(z.object({
    isEmriId: z.number().int(), emirNo: z.string(), opNo: z.number().int(), adim: z.string().nullable(),
    gonderilen: z.number().int(), donen: z.number().int(), hurda: z.number().int(),
    donenKart: z.object({ malzemeId: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), birim: z.string().nullable() }),
    statulu: z.boolean(),
  })),
});
export type FasonIsleriCevabi = z.output<typeof fasonIsleriCevabi>;
export const malKabulGovdesi = z.object({
  tur: z.enum(MAL_KABUL_TURLERI),
  irsaliyeNo: bosOlabilir(30),
  satirlar: z.array(malKabulSatirGirdisi).min(1, 'En az bir satır girin.').max(50),
  // Fason konumunda giden yetmezse onayla eksiye düşülür (çıkıştaki gibi).
  eksiOnay: z.boolean().optional(),
});
export type MalKabulGovdesi = z.input<typeof malKabulGovdesi>;
// Düzeltmede sıfır miktar o kalemin gelmediğidir; satırsız ya da hepsi sıfır düzeltme belgeyi tamamen iptal eder.
export const malKabulDuzeltGovdesi = z.object({
  satirlar: z.array(malKabulSatirGirdisi.extend({ miktar: sifirOlabilirMiktar })).max(50),
  eksiOnay: z.boolean().optional(),
});
export type MalKabulDuzeltGovdesi = z.input<typeof malKabulDuzeltGovdesi>;

export const malKabulOzeti = z.object({
  id: z.number().int(),
  no: z.string(),
  tur: z.enum(MAL_KABUL_TURLERI),
  irsaliyeNo: z.string().nullable(),
  zaman: zamanSemasi,
  kisiAd: z.string().nullable(),
  satirSayisi: z.number().int(),
  farkSayisi: z.number().int(),
  duzeltilenId: z.number().int().nullable(),
  duzeltenId: z.number().int().nullable(),
});
export type MalKabulOzeti = z.output<typeof malKabulOzeti>;
export const malKabulSatiri = z.object({
  sira: z.number().int(),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  sayilanMiktar: ondalikMetinSemasi,
  partiId: z.number().int().nullable(),
  partiEtiketi: z.string().nullable(),
  partiBelgeleri: z.array(partiBelgesi),
  // Saf hizmet satırı stok yazmaz: konum ve hareket boştur.
  konumKod: z.string().nullable(),
  hareketId: z.number().int().nullable(),
  siparisSatirId: z.number().int().nullable(),
  // hizmetMalzemeId: sipariş satırının hizmet kartı; düzeltmede satır yeniden kurulurken gerekir.
  fason: z.object({ malzemeId: z.number().int(), malzemeAd: z.string().nullable(), miktar: ondalikMetinSemasi, konumId: z.number().int(), konumKod: z.string(), hareketId: z.number().int(), hizmetMalzemeId: z.number().int().nullable() }).nullable(),
  logoDurumu: z.enum(LOGO_ESLESME_DURUMLARI),
  logoIrsaliyeSatirNo: z.number().int().nullable(),
  logoIrsaliyeMiktari: ondalikMetinSemasi.nullable(),
});
export const malKabulAyrintiCevabi = z.object({ belge: malKabulOzeti, satirlar: z.array(malKabulSatiri) });
export type MalKabulAyrintiCevabi = z.output<typeof malKabulAyrintiCevabi>;
// Satın alma kabulünde seçilecek açık sipariş satırları (satın almanın `siparisSatirlari`; fiyatsız). Malzeme no kalem kataloğa
// bağlı değilse null: kart elle seçilir.
export const acikSiparisSatiri = z.object({
  id: z.number().int(),
  siparisNo: z.string(),
  talepNo: z.string(),
  tedarikciAdi: z.string(),
  malzemeId: z.number().int().nullable(),
  // Kartın türü; hizmetse satır fason dönüşü ya da saf hizmettir.
  malzemeTur: z.enum(MALZEME_TURLERI).nullable(),
  kalemAdi: z.string(),
  miktar: ondalikMetinSemasi,
  // Sipariş - net teslim, eksiye inmez; mal kabulde önerilen miktar budur.
  kalanMiktar: ondalikMetinSemasi,
  birim: z.string(),
  beklenenTeslim: z.string().nullable(),
});
export type AcikSiparisSatiri = z.output<typeof acikSiparisSatiri>;
export const acikSiparisSatirlariCevabi = z.object({ satirlar: z.array(acikSiparisSatiri) });
export type AcikSiparisSatirlariCevabi = z.output<typeof acikSiparisSatirlariCevabi>;
export const malKabullerSorgusu = z.object({
  ...listeSorguAlanlari(['zaman', 'no']),
  tur: z.enum(MAL_KABUL_TURLERI).optional(),
  logoDurumu: z.enum(LOGO_ESLESME_DURUMLARI).optional(),
  baslangic: zamanSemasi.optional(),
  bitis: zamanSemasi.optional(),
  metin: z.string().trim().max(30).optional(),
});
export type MalKabullerSorgusu = z.input<typeof malKabullerSorgusu>;
export const malKabullerCevabi = listeCevapSemasi(malKabulOzeti);
export type MalKabullerCevabi = z.output<typeof malKabullerCevabi>;

// Kart #1124: satın almanın sipariş panelindeki "Mal kabul: irsaliye girildi" satırı. Sipariş satırına bağlı, düzeltilmemiş
// mal kabul belgeleri; irsaliye tarihi belgenin kayıt zamanıdır (stokta ayrı irsaliye tarihi yoktur).
export const siparisIrsaliyeleriSorgusu = z.object({
  siparisSatirlari: z.string().regex(/^\d{1,10}(,\d{1,10}){0,199}$/, 'Virgülle ayrılmış sipariş satırı kimlikleri.')
    .transform((t) => [...new Set(t.split(',').map(Number))]).pipe(z.array(kimlik)),
});
export const siparisIrsaliyesi = z.object({
  siparisSatirId: z.number().int(), malKabulId: z.number().int(), malKabulNo: z.string(), irsaliyeNo: z.string().nullable(), zaman: zamanSemasi,
});
export type SiparisIrsaliyesi = z.output<typeof siparisIrsaliyesi>;
export const siparisIrsaliyeleriCevabi = z.object({ irsaliyeler: z.array(siparisIrsaliyesi) });
export type SiparisIrsaliyeleriCevabi = z.output<typeof siparisIrsaliyeleriCevabi>;

export const uretimGirisiGovdesi = z.object({ uretimEmriId: kimlik, malzemeId: kimlik, miktar: miktarSemasi, konumId: kimlik.optional() });
export type UretimGirisiGovdesi = z.input<typeof uretimGirisiGovdesi>;

// Emir tamamlama (EK "Stok ve tamamlama"): bitmiş emrin kalan sarfı en eski girişten düşülür, çıktısı üretim alanına girer.
// Önizleme ile komut aynı hesabı yapar; engel varsa komut reddeder. Çıktı emrin girilmemiş sağlam adedidir; `miktar` daha azını girer.
export const emirTamamlamaCevabi = z.object({
  emir: z.object({ id: z.number().int(), emirNo: z.string(), durum: z.string(), adet: z.number().int(), malzemeId: z.number().int(), malzemeAd: z.string().nullable() }),
  cikti: z.object({ girilen: z.string(), kalan: z.string() }),
  bilesenler: z.array(z.object({
    malzemeId: z.number().int(), malzemeAd: z.string().nullable(), hizmet: z.boolean(),
    brut: z.string(), verilen: z.string(), kalan: z.string(), mevcut: z.string(), eksik: z.string(),
  })),
  engel: z.string().nullable(),
});
export type EmirTamamlamaCevabi = z.output<typeof emirTamamlamaCevabi>;
// `miktar: '0'` çıktı girmeden yalnız kalan sarfı yazar (sağlam adedi önceden girilmiş ya da hepsi fire olmuş emir).
export const emirTamamlaGovdesi = z.object({ miktar: sifirOlabilirMiktar.optional(), aciklama: bosOlabilir(200) });
export type EmirTamamlaGovdesi = z.input<typeof emirTamamlaGovdesi>;
export type EmirTamamlaKomutu = z.output<typeof emirTamamlaGovdesi>;

// ---- Taşıma, çıkış, sayım, geri alma -----------------------------------------------------------------------------------
// `partiId` verilmezse gözdeki tek parti kullanılır, birden çok parti varsa seçim istenir (DEP-23); null partisiz satırdır.
export const tasimaGovdesi = z.object({
  malzemeId: kimlik,
  kaynakKonumId: kimlik,
  partiId: buyukKimlik.nullable().optional(),
  hedefKonumId: kimlik,
  miktar: miktarSemasi,
  eksiOnay: z.boolean().optional(),
  aciklama: bosOlabilir(200),
});
export type TasimaGovdesi = z.input<typeof tasimaGovdesi>;
// Statü değişimi (#1108, STK-S1): aynı konumda kaynak statüden hedef statüye transfer hareketi; null serbesttir. Eksiye düşmez.
export const statuDegistirGovdesi = z.object({
  malzemeId: kimlik,
  konumId: kimlik,
  partiId: buyukKimlik.nullable(),
  kaynakStatuId: kimlik.nullable(),
  hedefStatuId: kimlik.nullable(),
  miktar: miktarSemasi,
  aciklama: bosOlabilir(200),
});
export type StatuDegistirGovdesi = z.input<typeof statuDegistirGovdesi>;
export type StatuDegistirKomutu = z.output<typeof statuDegistirGovdesi>;
export const cikisGovdesi = z.object({
  malzemeId: kimlik,
  konumId: kimlik,
  partiId: buyukKimlik.nullable().optional(),
  miktar: miktarSemasi,
  cikisNedeni: z.enum(CIKIS_NEDENLERI),
  uretimEmriId: kimlik.optional(),
  eksiOnay: z.boolean().optional(),
  aciklama: bosOlabilir(200),
  // Verilmezse serbest satırdan düşülür; red sevke uyarıyla çıkar, karar bekleyen çıkamaz (147 b).
  kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(),
});
export type CikisGovdesi = z.input<typeof cikisGovdesi>;
export const sayimGovdesi = z.object({
  konumId: kimlik,
  satirlar: z.array(z.object({ malzemeId: kimlik, partiId: buyukKimlik.nullable(), beklenenMiktar: z.string().trim().regex(/^-?\d{1,11}(\.\d{1,3})?$/), sayilanMiktar: sifirOlabilirMiktar })).max(200),
});
export type SayimGovdesi = z.input<typeof sayimGovdesi>;
export const geriAlGovdesi = z.object({ eksiOnay: z.boolean().optional(), aciklama: bosOlabilir(200) });
export type GeriAlGovdesi = z.input<typeof geriAlGovdesi>;
// Toplu geri alma: hepsi tek işlemde ya da hiçbiri.
export const topluGeriAlGovdesi = z.object({ hareketIdler: z.array(buyukKimlik).min(1).max(200), eksiOnay: z.boolean().optional(), aciklama: bosOlabilir(200) });
export type TopluGeriAlGovdesi = z.input<typeof topluGeriAlGovdesi>;
export type TopluGeriAlKomutu = z.output<typeof topluGeriAlGovdesi>;

// Yazma komutlarının ortak cevabı: yazılan hareketler (kimlikler) ve onaylı eksi olup olmadığı.
// uyari: karar bekleyen ya da red parça düşüldüyse kullanıcıya gösterilecek not (135, 147 b).
export const hareketCevabi = z.object({ hareketIdler: z.array(z.number().int()), onayliEksi: z.boolean(), uyari: z.string().optional() });
export type HareketCevabi = z.output<typeof hareketCevabi>;
export const malKabulCevabi = z.object({ belge: malKabulOzeti, hareketIdler: z.array(z.number().int()) });
export type MalKabulCevabi = z.output<typeof malKabulCevabi>;
export const sayimCevabi = z.object({ hareketIdler: z.array(z.number().int()), farkSayisi: z.number().int() });
export type SayimCevabi = z.output<typeof sayimCevabi>;

export const hareketlerSorgusu = z.object({
  ...listeSorguAlanlari(['zaman']),
  metin: z.string().trim().max(40).optional(),
  malzemeId: kimlik.optional(),
  konumId: kimlik.optional(),
  partiId: buyukKimlik.optional(),
  tur: z.enum(HAREKET_TURLERI).optional(),
  uretimEmriId: kimlik.optional(),
  baslangic: zamanSemasi.optional(),
  bitis: zamanSemasi.optional(),
});
export type HareketlerSorgusu = z.input<typeof hareketlerSorgusu>;
export const hareketlerCevabi = listeCevapSemasi(hareket);
export type HareketlerCevabi = z.output<typeof hareketlerCevabi>;

export const sayfaSorgusu = z.object({ ...sayfaSorguAlanlari });

// Sunucunun gördüğü (dönüştürülmüş) komut tipleri.
export type MalKabulKomutu = z.output<typeof malKabulGovdesi>;
export type MalKabulDuzeltKomutu = z.output<typeof malKabulDuzeltGovdesi>;
export type RafAcKomutu = z.output<typeof rafAcGovdesi>;
export type RafDuzenleKomutu = z.output<typeof rafDuzenleGovdesi>;
export type MalzemeAyarKomutu = z.output<typeof malzemeAyarGovdesi>;
export type UretimGirisiKomutu = z.output<typeof uretimGirisiGovdesi>;
export type TasimaKomutu = z.output<typeof tasimaGovdesi>;
export type CikisKomutu = z.output<typeof cikisGovdesi>;
export type SayimKomutu = z.output<typeof sayimGovdesi>;
export type KonumlarListesi = z.output<typeof konumlarSorgusu>;
export type RaflarListesi = z.output<typeof raflarSorgusu>;
export type MalzemelerListesi = z.output<typeof malzemelerSorgusu>;
export type PartilerListesi = z.output<typeof partilerSorgusu>;
export type MalKabullerListesi = z.output<typeof malKabullerSorgusu>;
export type HareketlerListesi = z.output<typeof hareketlerSorgusu>;

// ---- Sepet, teslim ve fiş (DEP-40, DEP-41, DEP-54) ------------------------------------------------------------------------
// Sepet kişinindir. Kaynak konumu boş satır teslimde en eski girişten alınır; `mevcut` o kaynakta ya da depoda kullanılabilir miktardır.
export const sepetSatiri = z.object({
  id: z.number().int(),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  malzemeKod: z.string().nullable(),
  kaynakKonumId: z.number().int().nullable(),
  kaynakKonumKod: z.string().nullable(),
  partiId: z.number().int().nullable(),
  partiEtiketi: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  mevcut: ondalikMetinSemasi,
  eklenme: zamanSemasi,
});
export type SepetSatiri = z.output<typeof sepetSatiri>;
export const sepetCevabi = z.object({ satirlar: z.array(sepetSatiri) });
export type SepetCevabi = z.output<typeof sepetCevabi>;
export const sepetEkleGovdesi = z.object({ malzemeId: kimlik, miktar: miktarSemasi, kaynakKonumId: kimlik.optional(), partiId: buyukKimlik.nullable().optional() });
export type SepetEkleGovdesi = z.input<typeof sepetEkleGovdesi>;
export type SepetEkleKomutu = z.output<typeof sepetEkleGovdesi>;
export const sepetDegistirGovdesi = z.object({ miktar: miktarSemasi });
export type SepetDegistirGovdesi = z.input<typeof sepetDegistirGovdesi>;
// Taşı: satır başına hedef verilebilir; hedefi verilmeyen satır ortak hedefe gider. Her hedef için ayrı fiş yazılır.
export const teslimGovdesi = z.object({
  hedefKonumId: kimlik.optional(),
  satirHedefleri: z.array(z.object({ satirId: buyukKimlik, hedefKonumId: kimlik })).max(200).optional(),
  aciklama: bosOlabilir(200), eksiOnay: z.boolean().optional(),
}).refine((g) => g.hedefKonumId !== undefined || (g.satirHedefleri?.length ?? 0) > 0, { message: 'Teslim yerini seçin.', path: ['hedefKonumId'] });
export type TeslimGovdesi = z.input<typeof teslimGovdesi>;
export type TeslimKomutu = z.output<typeof teslimGovdesi>;
export const stoktanDusGovdesi = z.object({ cikisNedeni: z.enum(CIKIS_NEDENLERI), uretimEmriId: kimlik.optional(), aciklama: bosOlabilir(200), eksiOnay: z.boolean().optional() });
export type StoktanDusGovdesi = z.input<typeof stoktanDusGovdesi>;
export type StoktanDusKomutu = z.output<typeof stoktanDusGovdesi>;
export const fisOzeti = z.object({
  id: z.number().int(),
  no: z.string(),
  zaman: zamanSemasi,
  hedefKonumId: z.number().int().nullable(),
  hedefKonumKod: z.string().nullable(),
  cikisNedeni: z.enum(CIKIS_NEDENLERI).nullable(),
  uretimEmriId: z.number().int().nullable(),
  // Başka modülün fiş fikstürleri alanı bilmez; sunucu her zaman doldurur (numara bulunamazsa null).
  emirNo: z.string().nullable().optional(),
  aciklama: z.string().nullable(),
  kisiAd: z.string().nullable(),
  satirSayisi: z.number().int(),
});
export type FisOzeti = z.output<typeof fisOzeti>;
export const fisCevabi = z.object({ fis: fisOzeti });
export type FisCevabi = z.output<typeof fisCevabi>;
// Taşı birden çok hedefe gidebilir: `fis` ilk fiştir, `fisler` hepsi.
export const sepetTeslimCevabi = z.object({ fis: fisOzeti, fisler: z.array(fisOzeti).min(1) });
export type SepetTeslimCevabi = z.output<typeof sepetTeslimCevabi>;
export const fisAyrintiCevabi = z.object({ fis: fisOzeti, hareketler: z.array(hareket) });
export type FisAyrintiCevabi = z.output<typeof fisAyrintiCevabi>;
export const fislerSorgusu = z.object({ ...listeSorguAlanlari(['zaman']) });
export type FislerSorgusu = z.input<typeof fislerSorgusu>;
export type FislerListesi = z.output<typeof fislerSorgusu>;
export const fislerCevabi = listeCevapSemasi(fisOzeti);
export type FislerCevabi = z.output<typeof fislerCevabi>;

// ---- Refakat partisi (kart #123): emir + depodan verilen lot. Depo lotu okutup emre ayırınca doğar, kartı basılır; teslim kartla
// yapılır. Aynı emre aynı lotun kalanı aynı kartla, başka lot yeni kartla gider (Soru 120 b, 116 b).
export const REFAKAT_PARTISI_DURUMLARI = ['acik', 'iptal'] as const;
const refakatBagi = z.object({ id: z.number().int(), etiket: z.string() });
export const refakatPartisi = z.object({
  id: z.number().int(),
  // QR metni (`RP:<id>`) ve kartın okunur adı (emir no + sıra, UE-000120-P2).
  qr: z.string(), etiket: z.string(),
  uretimEmriId: z.number().int(), emirNo: z.string().nullable(), sira: z.number().int(),
  malzemeId: z.number().int(), malzemeKod: z.string().nullable(), malzemeAd: z.string().nullable(), birim: z.string().nullable(),
  // İstisna kartının (Soru 129, 131 a) lotu, depo bağlayana kadar boştur; bağlanınca zamanı yazılır.
  partiId: z.number().int().nullable(), lotNo: z.string().nullable(), tedarikciPartiNo: z.string().nullable(), dokumNo: z.string().nullable(), sertifikaNo: z.string().nullable(),
  lotaBaglanmaZamani: zamanSemasi.nullable(),
  // Bu kartla emre verilen: alınan teslimde alınan, yoldakinde gönderilen miktar.
  verilen: ondalikMetinSemasi,
  durum: z.enum(REFAKAT_PARTISI_DURUMLARI), surum: surumSemasi, kayitZamani: zamanSemasi,
  // Kart #126: alt parti (kol) kartı üst emrin kartından açılır; birleşen kolun kartı birleştiği karta yönlenir (okutma, teslim, sayım).
  ust: refakatBagi.nullable(), birlestigi: refakatBagi.nullable(), birlesmeZamani: zamanSemasi.nullable(),
});
export type RefakatPartisi = z.output<typeof refakatPartisi>;
export const refakatKolAcGovdesi = z.object({ uretimEmriId: kimlik });
export type RefakatKolAcGovdesi = z.input<typeof refakatKolAcGovdesi>;
// İz (kart #126): kartın lotu (kartta), üst ve alt kartları, birleşenler, aynı lotun başka kartları, kartlarla sayılan üretim
// partileri ve bugün eldekiler, bu partilerden yapılmış sevkler. Kartlar kartın kendisi, üstleri ve ona birleşenlerdir.
export const refakatIziCevabi = z.object({
  refakat: refakatPartisi,
  ustler: z.array(refakatPartisi), altlar: z.array(refakatPartisi), birlesenler: z.array(refakatPartisi), ayniLot: z.array(refakatPartisi),
  ciktilar: z.array(z.object({
    partiId: z.number().int(), lotNo: z.string(), refakatPartisiId: z.number().int(),
    malzemeId: z.number().int(), malzemeKod: z.string().nullable(), malzemeAd: z.string().nullable(), birim: z.string().nullable(), eldeki: ondalikMetinSemasi,
  })),
  sevkler: z.array(z.object({
    hareketId: z.number().int(), zaman: zamanSemasi, partiId: z.number().int(), lotNo: z.string(),
    malzemeId: z.number().int(), malzemeKod: z.string().nullable(), malzemeAd: z.string().nullable(), birim: z.string().nullable(),
    miktar: ondalikMetinSemasi, emirNo: z.string().nullable(), aciklama: z.string().nullable(),
  })),
});
export type RefakatIziCevabi = z.output<typeof refakatIziCevabi>;
// Lot iki yoldan gelir (Soru 116 b): okutulan lot etiketi (`LOT:<lot no>`) ya da lot okutularak eklenmiş depo sepeti satırı. Kart
// etiketi lot yerine geçmez. Sepet satırından açılınca satır sepetten çıkar; malzeme bundan sonra kartla ilerler.
export const refakatPartisiAcGovdesi = z.object({
  uretimEmriId: kimlik, lotKodu: z.string().trim().min(1).max(120).optional(), sepetSatirId: buyukKimlik.optional(),
}).refine((g) => (g.lotKodu === undefined) !== (g.sepetSatirId === undefined), { message: 'Lotu okutun ya da sepetteki lot satırını seçin.', path: ['lotKodu'] });
export type RefakatPartisiAcGovdesi = z.input<typeof refakatPartisiAcGovdesi>;
export const refakatPartisiCevabi = z.object({ refakat: refakatPartisi });
export type RefakatPartisiCevabi = z.output<typeof refakatPartisiCevabi>;
// Lot bekleyen kartlar (Soru 129): lotsuz istisna kartları ve bağlanmamış lotsuz düşüm toplamı (kartın malzemesinin biriminde).
export const lotBekleyenKartlarCevabi = z.object({ kartlar: z.array(z.object({ refakat: refakatPartisi, bekleyen: ondalikMetinSemasi })) });
export type LotBekleyenKartlarCevabi = z.output<typeof lotBekleyenKartlarCevabi>;
// Lota bağlama: okutulan lot etiketi ya da (eksik malzeme başka kartın malzemesiyse) o refakat kartı. Lot yetmezse yeten düşümler
// bağlanır, kalan bekler; hepsi bağlanınca kart o lotu alır ya da emrin aynı lotlu kartına birleşir.
export const refakatLotaBaglaGovdesi = z.object({ kod: z.string().trim().min(1).max(120), surum: surumSemasi });
export type RefakatLotaBaglaGovdesi = z.input<typeof refakatLotaBaglaGovdesi>;
export const refakatLotaBaglaCevabi = z.object({ refakat: refakatPartisi, baglanan: ondalikMetinSemasi, bekleyen: ondalikMetinSemasi });
export type RefakatLotaBaglaCevabi = z.output<typeof refakatLotaBaglaCevabi>;
export const refakatPartileriCevabi = z.object({ partiler: z.array(refakatPartisi) });
export type RefakatPartileriCevabi = z.output<typeof refakatPartileriCevabi>;
// Kart: emrin refakat kartı (Üretim Emirleri'nin verisi) partinin QR'ı ve lot bilgisiyle.
export const refakatPartisiKartiCevabi = z.object({ refakat: refakatPartisi, kart: refakatKartiCevabi });
export type RefakatPartisiKartiCevabi = z.output<typeof refakatPartisiKartiCevabi>;

// ---- Kod çözümleme (Okut): konum kodu, "LOC:" önekli konum, kart numarası ya da "MLZ:" önekli kart numarası (DEP-55) --------
export const kodCozSorgusu = z.object({ kod: z.string().trim().min(1).max(80) });
export const kodCozCevabi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('konum'), konum, bakiyeler: z.array(bakiyeSatiri) }),
  z.object({ tur: z.literal('malzeme'), ozet: malzemeOzetiCevabi.shape.ozet, toplam: ondalikMetinSemasi, bakiyeler: z.array(bakiyeSatiri) }),
  // Okutulan lot: bakiyeler yalnız o lotun gözleridir; düşüm o lottan yapılır.
  // Refakat kartı okutulunca lotun çözümüne kartın partisi eklenir; gözler lotun bütün gözleridir.
  z.object({
    tur: z.literal('lot'), parti: z.object({ id: z.number().int(), lotNo: z.string(), etiket: z.string() }), ozet: malzemeOzetiCevabi.shape.ozet, toplam: ondalikMetinSemasi, bakiyeler: z.array(bakiyeSatiri),
    refakat: refakatPartisi.optional(),
  }),
  z.object({ tur: z.literal('bilinmiyor'), kod: z.string() }),
]);
export type KodCozCevabi = z.output<typeof kodCozCevabi>;

// ---- Lot etiketi (#1060): QR yalnız `LOT:<lot no>` taşır; geri kalanı basımda okunur. Veri yoksa null, alan basılmaz.
export const lotEtiketi = z.object({
  partiId: z.number().int(),
  lotNo: z.string(),
  malzemeId: z.number().int(),
  malzemeAd: z.string().nullable(),
  malzemeKod: z.string().nullable(),
  malzemeTuru: z.enum(MALZEME_TURLERI).nullable(),
  tedarikciPartiNo: z.string().nullable(),
  dokumNo: z.string().nullable(),
  sertifikaNo: z.string().nullable(),
  giris: zamanSemasi,
  miktar: ondalikMetinSemasi.nullable(),
  birim: z.string().nullable(),
  belgeNo: z.string().nullable(),
  // Mal kabul belgesindeki satır sırası (kopya sayısı satırın ambalaj sayısından önerilir); yeniden basımda null.
  sira: z.number().int().nullable(),
});
export type LotEtiketi = z.output<typeof lotEtiketi>;
export const lotEtiketleriCevabi = z.object({ etiketler: z.array(lotEtiketi) });
export type LotEtiketleriCevabi = z.output<typeof lotEtiketleriCevabi>;

export const MALZEME_ISTEGI_DURUMLARI = ['acik', 'stok_yok', 'hazirlaniyor', 'teslim', 'iptal'] as const;
export type MalzemeIstegiDurumu = (typeof MALZEME_ISTEGI_DURUMLARI)[number];

// ---- Toplama (DEP-42, DEP-56) -------------------------------------------------------------------------------------------
export const TOPLAMA_DURUMLARI = ['topluyor', 'bitti', 'iptal'] as const;
export type ToplamaDurumu = (typeof TOPLAMA_DURUMLARI)[number];
// Hazırlık listesi: kalemler elle girilir ya da isteklerden gelir (aynı malzemenin istekleri toplanır). Hedef verilirse
// toplanan mal oraya taşınır; verilmezse eskisi gibi sevk çıkışı yazılır.
export const toplamaAcGovdesi = z.object({
  ad: z.string().trim().min(1, 'Listeye ad verin (örn. sipariş no).').max(80),
  kalemler: z.array(z.object({ malzemeId: kimlik, miktar: miktarSemasi })).max(50).default([]),
  istekIdler: z.array(kimlik).max(50).optional(),
  hedef: z.union([z.object({ konumId: kimlik }), z.object({ istasyonId: kimlik })]).nullable().optional(),
}).refine((g) => g.kalemler.length > 0 || (g.istekIdler?.length ?? 0) > 0, { message: 'En az bir kalem girin.', path: ['kalemler'] });
export type ToplamaAcGovdesi = z.input<typeof toplamaAcGovdesi>;
export type ToplamaAcKomutu = z.output<typeof toplamaAcGovdesi>;
export const toplamaOzeti = z.object({
  id: z.number().int(), no: z.string(), ad: z.string(), durum: z.enum(TOPLAMA_DURUMLARI), acilis: zamanSemasi, kapanis: zamanSemasi.nullable(),
  kisiAd: z.string().nullable(), kapatanKisiAd: z.string().nullable(), adimSayisi: z.number().int(), toplanan: z.number().int(), eksikVar: z.boolean(), surum: surumSemasi,
});
export type ToplamaOzeti = z.output<typeof toplamaOzeti>;
export const toplamaAdimi = z.object({
  id: z.number().int(), sira: z.number().int(), malzemeId: z.number().int(), malzemeAd: z.string().nullable(), konumId: z.number().int(), konumKod: z.string(),
  partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(), miktar: ondalikMetinSemasi, toplandi: z.boolean(), hareketId: z.number().int().nullable(),
  // Gerçekte toplanan (kısmi olabilir); toplanmadıysa null.
  toplanan: ondalikMetinSemasi.nullable(),
});
export type ToplamaAdimi = z.output<typeof toplamaAdimi>;
export const toplamaAyrintiCevabi = z.object({
  toplama: toplamaOzeti,
  kalemler: z.array(z.object({ malzemeId: z.number().int(), malzemeAd: z.string().nullable(), istenen: ondalikMetinSemasi, eksik: ondalikMetinSemasi })),
  adimlar: z.array(toplamaAdimi),
  // Hedef yoksa toplanan sevk çıkışıdır.
  hedef: z.object({ konumId: z.number().int(), kod: z.string(), ad: z.string().nullable(), istasyonId: z.number().int().nullable() }).nullable(),
  istekler: z.array(z.object({ id: z.number().int(), no: z.string(), malzemeId: z.number().int(), miktar: ondalikMetinSemasi, karsilanan: ondalikMetinSemasi.nullable(), durum: z.enum(MALZEME_ISTEGI_DURUMLARI) })),
});
export type ToplamaAyrintiCevabi = z.output<typeof toplamaAyrintiCevabi>;
export const toplamalarSorgusu = z.object({ ...listeSorguAlanlari(['acilis']), durum: z.enum(TOPLAMA_DURUMLARI).optional() });
export type ToplamalarSorgusu = z.input<typeof toplamalarSorgusu>;
export type ToplamalarListesi = z.output<typeof toplamalarSorgusu>;
export const toplamalarCevabi = listeCevapSemasi(toplamaOzeti);
export type ToplamalarCevabi = z.output<typeof toplamalarCevabi>;
// Miktar verilmezse adımın planlanan miktarı toplanır; daha azı kısmi toplamadır, fazlası reddedilir.
export const adimToplaGovdesi = z.object({ ...beklenenSurum, miktar: miktarSemasi.optional(), eksiOnay: z.boolean().optional() });
export type AdimToplaGovdesi = z.input<typeof adimToplaGovdesi>;
export const toplamaKapatGovdesi = z.object({ ...beklenenSurum, durum: z.enum(['bitti', 'iptal']) });
export type ToplamaKapatGovdesi = z.input<typeof toplamaKapatGovdesi>;
export const toplamaAdimParametresi = z.object({ id: kimlik, adimId: buyukKimlik });

// ---- Malzeme isteği: üretimden (Arkon) gelir, depo hazırlar ve teslim eder ------------------------------------------------
// stok_yok: açılışta kullanılabilir stok istenenden azdı; depo ve satın alma görür, istek yine karşılanabilir (kart #1208).
// Başka modülün `malzemeIstegiAc` çağrısının girdisi. Kaynak kimliği çağıranın belgesidir (ör. `arkon:logi:<id>`) ve tekrar korumasıdır.
export const malzemeIstegiAcGirdisi = z.object({
  malzemeId: kimlik,
  miktar: miktarSemasi,
  istasyonId: kimlik,
  uretimEmriId: kimlik.nullable(),
  not: bosOlabilir(200),
  kaynakKimligi: z.string().trim().min(3).max(120),
});
export type MalzemeIstegiAcGirdisi = z.input<typeof malzemeIstegiAcGirdisi>;
export const malzemeIstegi = z.object({
  id: z.number().int(), no: z.string(), kaynakKimligi: z.string(), malzemeId: z.number().int(), malzemeAd: z.string().nullable(),
  miktar: ondalikMetinSemasi, karsilanan: ondalikMetinSemasi.nullable(), istasyonId: z.number().int().nullable(), istasyonAd: z.string().nullable(),
  uretimEmriId: z.number().int().nullable(), aciklama: z.string().nullable(), durum: z.enum(MALZEME_ISTEGI_DURUMLARI),
  acilis: zamanSemasi, guncelleme: zamanSemasi, kisiAd: z.string().nullable(), kapatanKisiAd: z.string().nullable(), surum: surumSemasi,
  // İstek bir hazırlık listesindeyse o liste; tek tek teslim edilmez.
  toplamaId: z.number().int().nullable(), toplamaNo: z.string().nullable(),
  // İsteğe gönderilmiş, henüz teslim alınmamış teslim: istek açık kalır ama depo için iş bitmiştir (Akış A provası D1).
  yoldaTeslim: z.object({ id: z.number().int(), no: z.string() }).nullable().optional(),
  // Soru 96 a: istek bir istasyondan istendiyse o istasyon (depoya düşmez); reddedildiyse nedeni.
  kaynakIstasyonId: z.number().int().nullable().optional(), kaynakIstasyonAd: z.string().nullable().optional(), redNedeni: z.string().nullable().optional(),
});
export type MalzemeIstegi = z.output<typeof malzemeIstegi>;
export const malzemeIstekleriSorgusu = z.object({ ...listeSorguAlanlari(['acilis']), durum: z.enum(MALZEME_ISTEGI_DURUMLARI).optional() });
export type MalzemeIstekleriSorgusu = z.input<typeof malzemeIstekleriSorgusu>;
export type MalzemeIstekleriListesi = z.output<typeof malzemeIstekleriSorgusu>;
export const malzemeIstekleriCevabi = listeCevapSemasi(malzemeIstegi);
export type MalzemeIstekleriCevabi = z.output<typeof malzemeIstekleriCevabi>;
export const malzemeIstegiCevabi = z.object({ istek: malzemeIstegi });
export type MalzemeIstegiCevabi = z.output<typeof malzemeIstegiCevabi>;
// Teslimde depo karşıladığı miktarı yazar; istenenden çok olabilir (tam boy çubuk gibi).
// İstasyonsuz (kişiye) istekte malzeme verildiği konumdan kişinin istasyonuna taşınır (kart #1289): kaynak konum zorunludur;
// istasyon verilmezse kişinin bulunduğu istasyon kullanılır.
export const istekTeslimGovdesi = z.object({
  ...beklenenSurum,
  karsilanan: miktarSemasi,
  kaynakKonumId: kimlik.optional(),
  partiId: kimlik.nullable().optional(),
  statuId: kimlik.nullable().optional(),
  istasyonId: kimlik.nullable().optional(),
});
export type IstekTeslimGovdesi = z.input<typeof istekTeslimGovdesi>;

// ---- Malzeme · Teslim: bütün sayfalardan istek ve iki adımlı teslim (kart #1208) --------------------------------------------
// Herkes (stok.istek) katalogdan malzeme ister; istasyonsuz istek isteyen kişiye teslim edilir.
export const istekAcGovdesi = z.object({
  malzemeId: kimlik,
  miktar: miktarSemasi,
  istasyonId: kimlik.nullable(),
  uretimEmriId: kimlik.nullable().optional(),
  not: bosOlabilir(200),
  kaynakKimligi: z.string().trim().min(3).max(120),
  // Soru 96 a: verilirse istek o istasyondan istenir; teslim yeri istasyon olmalıdır. Verilmezse depodan.
  kaynakIstasyonId: kimlik.nullable().optional(),
});
export type IstekAcGovdesi = z.input<typeof istekAcGovdesi>;
// İstasyondan istenen isteği o istasyonun yetkilisi kabul edip teslim gönderir (iki imza korunur: alan teslimi alır) ya da reddeder.
export const istekKabulGovdesi = z.object({
  ...beklenenSurum, miktar: miktarSemasi, partiId: buyukKimlik.nullable().optional(), statuId: kimlik.nullable().optional(), kaynakKimligi: z.string().trim().min(3).max(120),
});
export type IstekKabulGovdesi = z.input<typeof istekKabulGovdesi>;
export const istekReddetGovdesi = z.object({ ...beklenenSurum, neden: z.string().trim().min(1, 'Red nedeni yazın.').max(200) });
export type IstekReddetGovdesi = z.input<typeof istekReddetGovdesi>;
// "Nerede var" (soru 96 a, 93 a): depodaki kullanılabilir toplam ve istasyonlardaki serbest miktar (yoldaki düşülür, kalitesi serbest).
export const malzemeYerleriSorgusu = z.object({ malzemeId: kimlik });
export const malzemeYerleriCevabi = z.object({
  depo: ondalikMetinSemasi,
  istasyonlar: z.array(z.object({ istasyonId: z.number().int(), kod: z.string(), ad: z.string(), statuId: z.number().int().nullable(), miktar: ondalikMetinSemasi })),
});
export type MalzemeYerleriCevabi = z.output<typeof malzemeYerleriCevabi>;
// Okutarak al (soru 96 b): alan kişi malzemeyi (ya da lotu) ve aldığı yerin etiketini okutur; sunucu iki kodu yeniden çözer.
export const okutarakAlSorgusu = z.object({ kod: z.string().trim().min(1).max(120), yerKodu: z.string().trim().min(1).max(120) });
export const okutarakAlCevabi = z.object({
  malzeme: z.object({ id: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), birim: z.string().nullable() }),
  yer: z.object({ konumId: z.number().int(), istasyonId: z.number().int(), kod: z.string(), ad: z.string() }),
  satirlar: z.array(z.object({
    partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(), statuId: z.number().int().nullable(), uretimEmriId: z.number().int().nullable(), miktar: ondalikMetinSemasi,
  })),
});
export type OkutarakAlCevabi = z.output<typeof okutarakAlCevabi>;
export const okutarakAlGovdesi = z.object({
  kod: z.string().trim().min(1).max(120), yerKodu: z.string().trim().min(1).max(120), istasyonId: kimlik,
  partiId: buyukKimlik.nullable(), statuId: kimlik.nullable(), miktar: miktarSemasi, uretimEmriId: kimlik.nullable().optional(),
  kaynakKimligi: z.string().trim().min(3).max(120),
});
export type OkutarakAlGovdesi = z.input<typeof okutarakAlGovdesi>;
export const itirazGovdesi = z.object({ ...beklenenSurum, neden: z.string().trim().min(1, 'İtiraz nedenini yazın.').max(200) });
export type ItirazGovdesi = z.input<typeof itirazGovdesi>;
export const TESLIM_DURUMLARI = ['yolda', 'teslim', 'red', 'iptal'] as const;
export type TeslimDurumu = (typeof TESLIM_DURUMLARI)[number];
// Teslimin iki ucu: istasyon (konumu kendiliğinden açılır) ya da stok konumu.
export const teslimYeri = z.union([z.object({ istasyonId: kimlik }).strict(), z.object({ konumId: kimlik }).strict()]);
export type TeslimYeri = z.input<typeof teslimYeri>;
export const teslimGonderGovdesi = z.object({
  malzemeId: kimlik,
  miktar: miktarSemasi,
  partiId: buyukKimlik.nullable().optional(),
  // Teslim statüyü değiştirmez; parça olduğu statüyle taşınır (boş: serbest).
  statuId: kimlik.nullable(),
  // Kalite durumu da değişmez; verilmezse serbest satırdan gönderilir (134 a).
  kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(),
  kaynak: teslimYeri,
  hedef: teslimYeri,
  uretimEmriId: kimlik.nullable().optional(),
  // Depo isteği karşılıyorsa: teslim alınınca istek de alınan miktarla kapanır.
  istekId: kimlik.nullable().optional(),
  not: bosOlabilir(200),
  kaynakKimligi: z.string().trim().min(3).max(120),
  // Kişiye teslim (299 b): alacak kişinin gösterdiği kod; sunucu yeniden doğrular, teslimi yalnız o kişi alır.
  aliciKodu: z.string().trim().min(1).max(80).nullable().optional(),
  // Refakat kartıyla teslim (kart #123): lot ve emir karttan okunur; verilen parti ya da emir kartınkiyle aynı olmalıdır.
  refakatPartisiId: kimlik.nullable().optional(),
});
export type TeslimGonderGovdesi = z.input<typeof teslimGonderGovdesi>;
// Teslim alan eksi onay veremez (STK-T6): kaynakta yetmezse teslim reddedilir, gönderen düzeltir.
export const teslimAlGovdesi = z.object({ ...beklenenSurum, alinan: miktarSemasi });
export type TeslimAlGovdesi = z.input<typeof teslimAlGovdesi>;
export const teslimReddetGovdesi = z.object({ ...beklenenSurum, neden: z.string().trim().min(1, 'Red nedeni yazın.').max(200) });
export type TeslimReddetGovdesi = z.input<typeof teslimReddetGovdesi>;
const teslimUcu = z.object({ konumId: z.number().int(), kod: z.string(), ad: z.string().nullable(), istasyonId: z.number().int().nullable() });
export const teslim = z.object({
  id: z.number().int(), no: z.string(), malzemeId: z.number().int(), malzemeAd: z.string().nullable(), miktar: ondalikMetinSemasi,
  partiId: z.number().int().nullable(), statuId: z.number().int().nullable(), kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(), kaynak: teslimUcu, hedef: teslimUcu,
  uretimEmriId: z.number().int().nullable(), istekId: z.number().int().nullable(), aciklama: z.string().nullable(), durum: z.enum(TESLIM_DURUMLARI),
  alinan: ondalikMetinSemasi.nullable(), redNedeni: z.string().nullable(), gonderenAd: z.string().nullable(), kapatanAd: z.string().nullable(),
  // Kişiye teslimde alacak kişi; boşsa istasyonun ya da deponun yetkilisi alır.
  aliciAd: z.string().nullable(),
  gonderim: zamanSemasi, kapanis: zamanSemasi.nullable(), surum: surumSemasi,
  // Soru 96 b: okutarak alındı, kaynak onayı yok; kaynak taraf itirazSonu'na kadar itiraz eder. İtiraz geri almaz, iade teslimi açar.
  okutarak: z.boolean().optional(), itirazSonu: zamanSemasi.nullable().optional(),
  itiraz: z.object({ neden: z.string(), kisiAd: z.string().nullable(), zaman: zamanSemasi, iadeTeslimId: z.number().int().nullable() }).nullable().optional(),
});
export type Teslim = z.output<typeof teslim>;
export const teslimCevabi = z.object({ teslim });
export type TeslimCevabi = z.output<typeof teslimCevabi>;
// Panelin tek okuması: bana gelenler (kapsamımdaki istasyonlara; depo işlemi olana depo konumlarına), gönderdiklerim ve isteklerim.
export const teslimKutusuCevabi = z.object({
  gelenler: z.array(teslim),
  gonderdiklerim: z.array(teslim),
  isteklerim: z.array(malzemeIstegi),
  // Soru 96: kapsamımdaki istasyonlardan istenenler (kabul ya da red bekler) ve okutarak alınan, itiraz süresi süren teslimler.
  bendenIstenenler: z.array(malzemeIstegi).optional(),
  okutarakAlinanlar: z.array(teslim).optional(),
  // Kaynak olarak seçilebilen istasyonlar (kişinin kapsamı); hedef olarak bütün aktif istasyonlar ve depo konumları.
  istasyonlar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string() })),
  hedefIstasyonlar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string() })),
  depoKonumlari: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable() })),
  // Serbest ara alanlar (istasyona bağlı olmayan bekleme yerleri): herkes bırakır ve alır; bırakılan teslim hemen alınmış sayılır.
  araAlanlar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string().nullable() })),
  // Kişinin şu an bulunduğu istasyon (açık işi ya da kapsamındaki tek istasyon); bilinmiyorsa null (STK-T7).
  buradakiIstasyonId: z.number().int().nullable(),
  // Teslim et'teki harita: depo zemini dama tahtası (harfler ön kenar boyunca, numaralar içeri); kare konumu "D-<kare>" kodlu
  // depo konumudur. Yerleşim yoksa null.
  harita: z.object({
    bina: z.object({ x0: z.number(), x1: z.number(), z0: z.number(), z1: z.number() }), kareBoyu: z.number(),
  }).nullable(),
  // Taşıma yolu (#1304): istasyonların ve seçilebilen konumların Fabrika Haritası karesi; panel kaynaktan hedefe yolu bu
  // karelerle çizer. Haritada bölüm yoksa null; karesi olmayan yer listede yoktur.
  zemin: z.object({
    bolumler: z.array(z.object({ salonId: z.number().int(), kod: z.string(), sutunlar: z.array(z.string()), satirlar: z.array(z.string()) })),
    istasyonlar: z.array(z.object({ istasyonId: z.number().int(), salonId: z.number().int(), hucre: z.string() })),
    konumlar: z.array(z.object({ konumId: z.number().int(), salonId: z.number().int(), hucre: z.string() })),
  }).nullable(),
});
export type TeslimKutusuCevabi = z.output<typeof teslimKutusuCevabi>;
// İstek panelinin malzeme seçicisi: katalogdaki stoklanan kart ve kullanılabilir miktar; statülü stok ayrı satırda.
export const istekMalzemeSorgusu = z.object({ ara: z.string().trim().max(80).optional() });
export const istekMalzemeleriCevabi = z.object({
  malzemeler: z.array(z.object({
    id: z.number().int(), kod: z.string(), ad: z.string().nullable(), birim: z.string().nullable(), kullanilabilir: ondalikMetinSemasi,
    statuler: z.array(z.object({ statuId: z.number().int(), miktar: ondalikMetinSemasi })),
  })),
});
export type IstekMalzemeleriCevabi = z.output<typeof istekMalzemeleriCevabi>;
// Teslim et: seçilen yerdeki stok (malzeme, parti, statü); yalnız kişinin gönderebildiği yer okunur.
export const yerdekiStokSorgusu = z.object({ istasyonId: kimlik.optional(), konumId: kimlik.optional() })
  .refine((v) => (v.istasyonId === undefined) !== (v.konumId === undefined), 'İstasyon ya da konum verin.');
export const yerdekiStokCevabi = z.object({
  satirlar: z.array(z.object({
    malzemeId: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(),
    statuId: z.number().int().nullable(), kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(), miktar: ondalikMetinSemasi,
  })),
});
export type YerdekiStokCevabi = z.output<typeof yerdekiStokCevabi>;
// QR Okut paneli (karar 91 a): stok.istek olan herkes okutur. Konum her zaman çözülür (teslim yeri olabilir); `satirlar` yalnız kişinin
// alabileceği yerde gelir, alamadığı yerde null. Malzeme ve lotta `yerler` yalnız alabileceği yerlerin serbest stoğudur (yoldaki düşülür).
export const okutYeri = z.object({ konumId: z.number().int(), kod: z.string(), ad: z.string().nullable(), tur: z.enum(KONUM_TURLERI), istasyonId: z.number().int().nullable() });
export const okutCozCevabi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('yer'), yer: okutYeri, satirlar: yerdekiStokCevabi.shape.satirlar.nullable() }),
  z.object({
    tur: z.literal('malzeme'),
    // tur ve partinin emri (kart #95): panel Teslim et'te mamul ve yarı mamulü sevke, emri fasona yönlendirir; stok okuması gerektirmez.
    malzeme: z.object({ id: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), birim: z.string().nullable(), tur: z.enum(MALZEME_TURLERI).optional() }),
    parti: z.object({ id: z.number().int(), etiket: z.string(), uretimEmriId: z.number().int().nullable().optional() }).nullable(),
    yerler: z.array(okutYeri.extend({ partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(), statuId: z.number().int().nullable(), kaliteDurumu: z.enum(KALITE_DURUMLARI).optional(), miktar: ondalikMetinSemasi })),
    // Soru 93 a: kapsam dışı istasyonlardaki serbest miktar; buradan teslim gönderilmez, Malzeme iste ile istenir ya da okutarak alınır.
    digerIstasyonlar: z.array(z.object({ istasyonId: z.number().int(), kod: z.string(), ad: z.string(), miktar: ondalikMetinSemasi })).optional(),
    // Refakat kartı okutulduysa (kart #123): kartın partisi ve kişinin alabileceği, o kartla yoldaki teslimler (Soru 118 a).
    refakat: refakatPartisi.optional(),
    gelenler: z.array(teslim).optional(),
  }),
  // Kişi kodu (299 b): imzası ve süresi doğrulanmış; teslim o kişinin bulunduğu istasyona, o kişiye yazılır.
  z.object({
    tur: z.literal('kisi'), kod: z.string(), kisi: z.object({ id: z.number().int(), ad: z.string().nullable() }),
    istasyon: z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }),
  }),
  z.object({ tur: z.literal('bilinmiyor'), kod: z.string() }),
]);
export type OkutCozCevabi = z.output<typeof okutCozCevabi>;
export type OkutYeri = z.output<typeof okutYeri>;
// Teslim al'da gösterilen kişi kodu: sunucu anahtarıyla imzalı, kısa süre geçerli; ekran süresi bitmeden yenisini alır.
export const kisiKoduCevabi = z.object({ kod: z.string(), gecerlilikSonu: zamanSemasi });
export type KisiKoduCevabi = z.output<typeof kisiKoduCevabi>;
// İstasyon sepeti (kart #1353): istasyondaki stok, getiren ya da üreten kişi ve emrin rotasındaki sonraki istasyon. Sonraki
// istasyon yoksa nedeni yazılır: son adım, fason adım ya da emrin rotası bu istasyondan geçmiyor (emirsiz malzeme dahil).
export const istasyonSepetiSorgusu = z.object({ istasyonId: kimlik });
export const SONRAKI_YOK_NEDENLERI = ['son-adim', 'fason', 'rota-disi'] as const;
export const istasyonSepetiCevabi = z.object({
  istasyon: z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }),
  // Sepetten üretimde kullanılabilen emirler: bu istasyonda bitmemiş adımı olan, yayımlanmış ve kapanmamış emirler.
  emirler: z.array(z.object({ id: z.number().int(), emirNo: z.string() })),
  satirlar: z.array(z.object({
    malzemeId: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), partiId: z.number().int().nullable(), partiEtiketi: z.string().nullable(),
    // miktar serbest olandır; yolda, gönderilip henüz alınmamış ve burada ayrılmış miktardır (kart #1410).
    statuId: z.number().int().nullable(), miktar: ondalikMetinSemasi, yolda: ondalikMetinSemasi, uretimEmriId: z.number().int().nullable(),
    getiren: z.string().nullable(), gelis: zamanSemasi.nullable(),
    // Sepet süzgeci (soru 89): satıra son giren hareket üretim (giriş, aynı yerde statü dönüşümü) mi, başka yerden teslim mi; giriş yoksa null.
    koken: z.enum(['uretim', 'teslim']).nullable().optional(),
    sonraki: z.object({ istasyonId: z.number().int(), kod: z.string().nullable(), ad: z.string(), opNo: z.number().int() }).nullable(),
    sonrakiYok: z.enum(SONRAKI_YOK_NEDENLERI).nullable(),
  })),
});
export type IstasyonSepetiCevabi = z.output<typeof istasyonSepetiCevabi>;
export type IstasyonSepetiSatiri = IstasyonSepetiCevabi['satirlar'][number];
// Üretimde kullan (kart #1353, kullanıcı kararı "İstasyondakiler"): malzeme isteyebilen kişi kapsamındaki istasyonun sepetinden yalnız
// o istasyondaki emre sarf yazar. Statülü parça da kullanılabilir; eksiye düşülmez.
export const sepettenKullanGovdesi = z.object({
  istasyonId: kimlik, malzemeId: kimlik, partiId: buyukKimlik.nullable(), statuId: kimlik.nullable(), miktar: miktarSemasi, uretimEmriId: kimlik,
});
export type SepettenKullanGovdesi = z.input<typeof sepettenKullanGovdesi>;
// Teslim edilmeyen parçayı kullanacak istasyon çeker (kart #1289): öteki istasyonların sepetinde sonraki adımı bu istasyon olan satırlar.
export const gelecekSepetCevabi = z.object({
  satirlar: z.array(istasyonSepetiCevabi.shape.satirlar.element.extend({ kaynak: istasyonSepetiCevabi.shape.istasyon })),
});
export type GelecekSepetCevabi = z.output<typeof gelecekSepetCevabi>;
export const sepettenCekGovdesi = z.object({
  istasyonId: kimlik, kaynakIstasyonId: kimlik, malzemeId: kimlik, partiId: buyukKimlik.nullable(), statuId: kimlik.nullable(), miktar: miktarSemasi,
  kaynakKimligi: z.string().trim().min(3).max(120),
});
export type SepettenCekGovdesi = z.input<typeof sepettenCekGovdesi>;

// Üretime hazırlık (kart #1289): terminal başlatmadan önce sorar. Adımın girdisi istasyonda bir adetlik yoksa eksiktir; her eksik için
// istasyona malzeme isteği bir kez açılır (bulunduğu yerler açıklamaya yazılır). Eksik varken başlatma reddedilir.
export const uretimHazirligiGovdesi = z.object({ uretimEmriId: kimlik, istasyonId: kimlik });
export type UretimHazirligiGovdesi = z.input<typeof uretimHazirligiGovdesi>;
export const uretimHazirligiCevabi = z.object({
  hazir: z.boolean(),
  eksikler: z.array(z.object({
    malzemeId: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(),
    // Bir adet için gereken ve istasyondaki serbest miktar.
    gereken: ondalikMetinSemasi, istasyonda: ondalikMetinSemasi,
    // Bulunduğu yerler (en eskisi önce); hiçbir yerde yoksa boş. istasyonId: yer bir istasyonsa (kart #1418, "Oradan al").
    // buEmrin: bu emre ayrılmış parti mi, emirsiz mi; aynı yerde ikisi ayrı satırdır.
    yerler: z.array(z.object({ konum: z.string(), miktar: ondalikMetinSemasi, konumId: z.number().int(), istasyonId: z.number().int().nullable(), buEmrin: z.boolean() })),
    istek: z.object({ id: z.number().int(), no: z.string(), durum: z.enum(MALZEME_ISTEGI_DURUMLARI), yoldaTeslim: malzemeIstegi.shape.yoldaTeslim }).nullable(),
  })),
});
export type UretimHazirligiCevabi = z.output<typeof uretimHazirligiCevabi>;
// Teslim al'da istasyondaki işlerin girdileri (kart #1289): bitmemiş her adım için, adım bitene kadar görünür.
export const isMalzemeleriCevabi = z.object({
  isler: z.array(z.object({
    uretimEmriId: z.number().int(), emirNo: z.string(), opNo: z.number().int(), adimAd: z.string(), calisiyor: z.boolean(), kalanAdet: z.number().int(),
    malzemeler: z.array(z.object({
      malzemeId: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(),
      // Miktarların birimi (kartın birimi); bilinmiyorsa null.
      birim: z.string().nullable(),
      // birAdet: bir adet için; gereken: kalan adet için. eksik: istasyonda bir adetlik yok.
      birAdet: ondalikMetinSemasi, gereken: ondalikMetinSemasi, istasyonda: ondalikMetinSemasi, eksik: z.boolean(),
      yerler: uretimHazirligiCevabi.shape.eksikler.element.shape.yerler,
      istek: uretimHazirligiCevabi.shape.eksikler.element.shape.istek,
    })),
  })),
});
export type IsMalzemeleriCevabi = z.output<typeof isMalzemeleriCevabi>;
// İşin malzemesini tek dokunuşla iste (kart #1418): kaynak verilmezse ya da depo konumuysa eksik miktarla depodan istek açılır;
// emrin rotasındaki başka istasyonsa oradaki malzeme teslim kaydıyla bu istasyona alınır.
export const isMalzemesiIsteGovdesi = z.object({
  istasyonId: kimlik, uretimEmriId: kimlik, opNo: z.number().int(), malzemeId: kimlik, kaynakKonumId: kimlik.nullable(),
  // İstasyondan alırken yalnız bu emrin (true) ya da yalnız emirsiz (false) partisi; null ikisi.
  buEmrin: z.boolean().nullable().default(null),
  kaynakKimligi: z.string().trim().min(3).max(100),
});
export type IsMalzemesiIsteGovdesi = z.input<typeof isMalzemesiIsteGovdesi>;

// ---- Depo yerleşimi (2B düzenleyici; önizlemedeki eksen: rafın bölmeleri -z yönünde, derinlik x'te, açı saat yönünün tersine) ----
const metre = (en: number, boy: number) => z.number().min(en).max(boy);
const binaSemasi = z.object({ x0: metre(-500, 500), x1: metre(-500, 500), z0: metre(-500, 500), z1: metre(-500, 500) })
  .refine((b) => b.x1 - b.x0 >= 5 && b.z1 - b.z0 >= 5, 'Bina en az 5 × 5 m olmalı.');
const kabulSemasi = z.object({ x: metre(-500, 500), z: metre(-500, 500), genislik: metre(1, 200), derinlik: metre(1, 200) });
const fasonSemasi = z.object({ x: metre(-500, 500), z: metre(-500, 500), aci: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) });
const yerlesimRafAlanlari = {
  kod: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, 'Raf kodu 1-3 büyük harf ya da rakam olmalı.'),
  tur: z.enum(RAF_TURLERI),
  numaralama: z.enum(NUMARALAMALAR),
  ilkBolme: z.number().int().min(1).max(999),
  bolmeSayisi: z.number().int().min(1).max(80),
  katSayisi: z.number().int().min(1).max(10),
  bolmeGenislikM: metre(0.3, 6),
  derinlikM: metre(0.2, 3),
  katAraligiM: metre(0.2, 4),
  xM: metre(-500, 500),
  zM: metre(-500, 500),
  aci: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  onYuzTers: z.boolean(),
};
export const yerlesimRafi = z.object({ id: z.number().int(), surum: surumSemasi, ...yerlesimRafAlanlari, doluBolmeler: z.array(z.number().int()), stokluGoz: z.number().int() });
export type YerlesimRafi = z.output<typeof yerlesimRafi>;
export const yerlesimCevabi = z.object({
  depo: z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }),
  yerlesim: z.object({ bina: binaSemasi, kabul: kabulSemasi, kareBoyu: metre(1, 50), sayimSuresiGun: z.number().int().min(1).max(365), fason: fasonSemasi, surum: surumSemasi }),
  raflar: z.array(yerlesimRafi),
});
export type YerlesimCevabi = z.output<typeof yerlesimCevabi>;
// Tek işlemde: yerleşim, değişen ve yeni raflar, kaldırılan raflar. Stoklu göz kaldırılamaz; numaralama değişirse gözler bölme
// sırasıyla yeni adrese geçer (stok gözle birlikte kalır).
export const yerlesimKaydetGovdesi = z.object({
  ...beklenenSurum,
  depoAdi: z.string().trim().min(1).max(60),
  bina: binaSemasi, kabul: kabulSemasi, kareBoyu: metre(1, 50), sayimSuresiGun: z.number().int().min(1).max(365), fason: fasonSemasi,
  raflar: z.array(z.object({ id: z.number().int().nullable(), surum: surumSemasi.nullable(), ...yerlesimRafAlanlari })).max(200),
  silinenler: z.array(z.object({ id: z.number().int(), surum: surumSemasi })).max(200),
});
export type YerlesimKaydetGovdesi = z.input<typeof yerlesimKaydetGovdesi>;
export type YerlesimKaydetKomutu = z.output<typeof yerlesimKaydetGovdesi>;

// ---- Stok içi arama (önizlemedeki Ctrl K): konum kodu ve adı, raf kodu, parti no, kart numarası ----------------------------------
export const araSorgusu = z.object({ q: z.string().trim().min(1).max(40) });
export const araCevabi = z.object({
  sonuclar: z.array(z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('konum'), konumId: z.number().int(), kod: z.string(), ad: z.string().nullable(), satirSayisi: z.number().int() }),
    z.object({ tur: z.literal('raf'), rafId: z.number().int(), kod: z.string(), rafTuru: z.enum(RAF_TURLERI) }),
    z.object({ tur: z.literal('parti'), partiId: z.number().int(), etiket: z.string(), malzemeId: z.number().int() }),
    z.object({ tur: z.literal('malzeme'), malzemeId: z.number().int(), ad: z.string().nullable(), kod: z.string(), toplam: ondalikMetinSemasi }),
  ])),
});
export type AraCevabi = z.output<typeof araCevabi>;

export const sayimBekleyenlerCevabi = z.object({ gun: z.number().int(), gozler: z.array(z.object({ konumId: z.number().int(), kod: z.string(), sonSayim: zamanSemasi.nullable() })) });
export type SayimBekleyenlerCevabi = z.output<typeof sayimBekleyenlerCevabi>;

// DEP-60 (A7, #516): malzeme kartı sipariş noktasını (kritik seviye) ve depo yerini (varsayılan konum) stoktan gösterir.
// Kart, satırı kimliğiyle eşler; yalnız ikisinden biri dolu olan malzemeler gelir.
export const malzemeKartBilgisi = z.object({
  malzemeId: z.number().int(),
  kartKimligi: z.string().nullable(),
  kritikSeviye: ondalikMetinSemasi.nullable(),
  varsayilanKonum: z.string().nullable(),
});
export const malzemeKartBilgileriCevabi = listeCevapSemasi(malzemeKartBilgisi);
export type MalzemeKartBilgileriCevabi = z.output<typeof malzemeKartBilgileriCevabi>;

// ---- Zemin ızgarası (kart #1304) ----------------------------------------------------------------------------------
// Stok Merkezi kareleri Fabrika Haritası'ndan alır: bölümün harf (sütun) ve numara (satır) adları, karedeki öğeler (raf,
// istasyon, makine, alan; simgeyle çizilir) ve kareye düşen stok konumları. Konumun karesi bağlı olduğu öğenin karesidir.
export const ZEMIN_NESNE_TURLERI = ['raf', 'istasyon', 'makine', 'alan'] as const;
export const zeminCevabi = z.object({
  bolumler: z.array(z.object({
    salonId: z.number().int(), kod: z.string(), ad: z.string(), surum: z.number().int(), depoKod: z.string().nullable(),
    sutunlar: z.array(z.string()), satirlar: z.array(z.string()),
    nesneler: z.array(z.object({ tur: z.enum(ZEMIN_NESNE_TURLERI), id: z.number().int(), kod: z.string().nullable(), ad: z.string(), altTur: z.string(), hucre: z.string() })),
    konumlar: z.array(z.object({ id: z.number().int(), kod: z.string(), tur: z.enum(KONUM_TURLERI), hucre: z.string(), satirSayisi: z.number().int() })),
  })),
  istasyonlar: z.array(z.object({ id: z.number().int(), kod: z.string(), ad: z.string(), tip: z.string(), salonId: z.number().int().nullable() })),
});
export type ZeminCevabi = z.output<typeof zeminCevabi>;

// Malzemenin emre ayrılması (rezerve; statuId null: serbest malzeme): terminal statüye geçirdiğinde kendiliğinden, Stok Merkezi'nde elle. Kapanan ya da
// iptal edilen emrin ayrılanı sayılmaz.
export const rezerveSatirlari = z.array(z.object({ statuId: z.number().int().nullable(), uretimEmriId: z.number().int(), emirNo: z.string().nullable(), miktar: ondalikMetinSemasi }));
export const rezervelerCevabi = z.object({ rezerveler: rezerveSatirlari });
export type RezervelerCevabi = z.output<typeof rezervelerCevabi>;
export const rezerveEtGovdesi = z.object({ malzemeId: kimlik, statuId: kimlik, uretimEmriId: kimlik, miktar: miktarSemasi });
export type RezerveEtGovdesi = z.input<typeof rezerveEtGovdesi>;
export type RezerveEtKomutu = z.output<typeof rezerveEtGovdesi>;
// Miktar verilmezse emrin bu statüdeki bütün ayrılanı kalkar; neden zorunludur (kim ve ne zaman kaydedilir).
export const rezerveKaldirGovdesi = z.object({
  malzemeId: kimlik, statuId: kimlik.nullable(), uretimEmriId: kimlik, miktar: miktarSemasi.optional(),
  neden: z.string().trim().min(1, 'Neden zorunlu.').max(200),
});
export type RezerveKaldirGovdesi = z.input<typeof rezerveKaldirGovdesi>;
export type RezerveKaldirKomutu = z.output<typeof rezerveKaldirGovdesi>;
