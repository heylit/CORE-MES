import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type {
  Adres, AdresKimligi, EllePuanTuru, Firma, FirmaKimligi, FirmaSatiri, FirmaTuru, KarneAgirliklari, KarneBilesenSatiri, KarneOlayKaynagi,
  KarneSinifi, LotKarari, MusteriSinifi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// 3473: Logo'ya bağlanırken bırakılan son kod; kartta "Eski kod" olarak görünür.
const ESKI_KOD = `(SELECT g.kod FROM musteri_tedarikci_kod_gecmisi g WHERE g.firma_id = musteri_tedarikci_firma.id
  ORDER BY g.birakildi DESC, g.id DESC LIMIT 1) AS "eskiKod"`;
// Firma listesinde eski kodla arama da firmayı bulur (3473). Seçici ve Ctrl K trigram indeksinde kalsın diye eski koda bakmaz.
const ESKI_KODLA = (sutun: string, desen: string) =>
  `EXISTS (SELECT 1 FROM musteri_tedarikci_kod_gecmisi g WHERE g.firma_id = ${sutun} AND public.arama_sade(g.kod) LIKE ${desen})`;
// Koordinat numeric(9,6) sütunudur; ekrana ve sözleşmeye sayı gider (altı ondalık float8'de kaybolmaz).
const FIRMA = `id, kod, ad, tur, fason, ulke_kodu AS "ulkeKodu", vergi_no AS "vergiNo", vergi_dairesi AS "vergiDairesi",
  para_birimi AS "paraBirimi", vade_gunu AS "vadeGunu", adres, ilce, il, posta_kodu AS "postaKodu", enlem::float8 AS enlem, boylam::float8 AS boylam,
  telefon, e_posta AS "ePosta", aktif, logo_cari_kodu AS "logoCariKodu", logo_kayit_no AS "logoKayitNo", logo_gonderim_durumu AS "logoGonderimDurumu",
  logo_crm_kodu AS "logoCrmKodu", musteri_sinifi AS "musteriSinifi", ${ESKI_KOD}, ${zamanMetni('olusturma')} AS olusturma, ${zamanMetni('guncelleme')} AS guncelleme, surum`;
const SATIR = `f.id, f.kod, f.ad, f.tur, f.fason, f.vergi_no AS "vergiNo", f.il, f.aktif, f.logo_cari_kodu AS "logoCariKodu", f.logo_kayit_no AS "logoKayitNo",
  (SELECT count(*)::int FROM musteri_tedarikci_adres a WHERE a.firma_id = f.id) AS "adresSayisi",
  (f.enlem IS NOT NULL OR EXISTS (SELECT 1 FROM musteri_tedarikci_adres a WHERE a.firma_id = f.id AND a.enlem IS NOT NULL)) AS koordinatli`;
const ADRES = `id, firma_id AS "firmaId", tur, ad, adres, ilce, il, posta_kodu AS "postaKodu", enlem::float8 AS enlem, boylam::float8 AS boylam,
  ${zamanMetni('olusturma')} AS olusturma, ${zamanMetni('guncelleme')} AS guncelleme`;

export const FIRMA_SIRALAMA: SiralamaTanimi<'ad' | 'kod'> = {
  sutunlar: { ad: 'f.ad', kod: 'f.kod' },
  ikincil: 'f.id',
  varsayilan: { sutun: 'ad', yon: 'artan' },
};

export interface FirmaSuzgeci {
  ara: string | null;
  turler: FirmaTuru[] | null;
  fason: boolean | null;
  aktif: boolean | null;
}
// Arama metni SQL'e yazılmaz; sadeleşmiş, kaçırılmış desen parametresidir (\, % ve _ harf sayılır). Sütun ve desen aynı
// Türkçe harf sadeleştirmesinden geçer (public.arama_sade, göç 20261029125000): ILIKE ve lower() veritabanının dil ayarına
// bağlıdır, 'IŞIK' ile 'ışık'ı eşlemez. İfade trigram indeksinin aynısıdır (göç 20261029127000). Desen yoksa süzgeç yoktur.
const desen = (metin: string | null): string | null => (metin === null ? null : icindeDeseni(metin));
const SUZGEC = `FROM musteri_tedarikci_firma f
  WHERE ($1::text IS NULL OR public.arama_sade(f.ad) LIKE $1 OR public.arama_sade(f.kod) LIKE $1 OR public.arama_sade(f.vergi_no) LIKE $1
    OR ${ESKI_KODLA('f.id', '$1')})
    AND ($2::text[] IS NULL OR f.tur = ANY($2::text[]))
    AND ($3::boolean IS NULL OR f.fason = $3)
    AND ($4::boolean IS NULL OR f.aktif = $4)`;
const suzgecParametreleri = (s: FirmaSuzgeci) => [desen(s.ara), s.turler, s.fason, s.aktif];

export async function firmaSay(db: Db, s: FirmaSuzgeci): Promise<number> {
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${SUZGEC}`, suzgecParametreleri(s)))?.toplam ?? 0;
}

export function firmaSatirlari(db: Db, s: FirmaSuzgeci, siralama: string, dilim: Dilim): Promise<FirmaSatiri[]> {
  return db.sorgu<FirmaSatiri>(
    `SELECT ${SATIR} ${SUZGEC} ORDER BY ${siralama} LIMIT $5 OFFSET $6`,
    [...suzgecParametreleri(s), dilim.sinir, dilim.atla],
  );
}
export const firmaSiralamasi = (istek: { sirala?: 'ad' | 'kod' | undefined; yon?: 'artan' | 'azalan' | undefined }): string =>
  siralamaSql(FIRMA_SIRALAMA, istek);

export function firmaGetir(db: Db, id: number, kilitle = false): Promise<Firma | null> {
  return db.tek<Firma>(`SELECT ${FIRMA} FROM musteri_tedarikci_firma WHERE id = $1${kilitle ? ' FOR UPDATE' : ''}`, [id]);
}

export function firmaEkle(db: Db, k: FirmaKimligi, kisiId: number): Promise<Firma | null> {
  return db.tek<Firma>(
    `INSERT INTO musteri_tedarikci_firma (kod, ad, tur, fason, ulke_kodu, vergi_no, vergi_dairesi, para_birimi, vade_gunu, adres, ilce, il,
       posta_kodu, enlem, boylam, telefon, e_posta, logo_cari_kodu, olusturan_id, musteri_sinifi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING ${FIRMA}`,
    [k.kod, k.ad, k.tur, k.fason, k.ulkeKodu, k.vergiNo, k.vergiDairesi, k.paraBirimi, k.vadeGunu, k.adres, k.ilce, k.il,
      k.postaKodu, k.enlem, k.boylam, k.telefon, k.ePosta, k.logoCariKodu, kisiId, k.musteriSinifi],
  );
}

export function firmaGuncelle(db: Db, id: number, surum: number, k: FirmaKimligi, kisiId: number): Promise<Firma | null> {
  return db.tek<Firma>(
    `UPDATE musteri_tedarikci_firma SET kod = $3, ad = $4, tur = $5, fason = $6, ulke_kodu = $7, vergi_no = $8, vergi_dairesi = $9,
       para_birimi = $10, vade_gunu = $11, adres = $12, ilce = $13, il = $14, posta_kodu = $15, enlem = $16, boylam = $17, telefon = $18,
       e_posta = $19, logo_cari_kodu = $20, guncelleyen_id = $21, musteri_sinifi = $22, guncelleme = now(), surum = surum + 1,
       logo_crm_kodu = CASE WHEN upper(logo_cari_kodu) IS NOT DISTINCT FROM upper($20) THEN logo_crm_kodu END
     WHERE id = $1 AND surum = $2
     RETURNING ${FIRMA}`,
    [id, surum, k.kod, k.ad, k.tur, k.fason, k.ulkeKodu, k.vergiNo, k.vergiDairesi, k.paraBirimi, k.vadeGunu, k.adres, k.ilce, k.il,
      k.postaKodu, k.enlem, k.boylam, k.telefon, k.ePosta, k.logoCariKodu, kisiId, k.musteriSinifi],
  );
}

// 3391-2 a: seçimin Logo'da o cariye bağlı olduğu çağıranda denetlenir; cari kodu aynı kalmadıysa yazılmaz.
export function firmaLogoCrmYaz(db: Db, id: number, surum: number, b: { cariKodu: string; kod: string | null }, kisiId: number): Promise<Firma | null> {
  return db.tek<Firma>(
    `UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $4, guncelleyen_id = $5, guncelleme = now(), surum = surum + 1
     WHERE id = $1 AND surum = $2 AND upper(logo_cari_kodu) = upper($3) RETURNING ${FIRMA}`,
    [id, surum, b.cariKodu, b.kod, kisiId],
  );
}

export function firmaAktiflikYaz(db: Db, id: number, surum: number, aktif: boolean, kisiId: number): Promise<Firma | null> {
  return db.tek<Firma>(
    `UPDATE musteri_tedarikci_firma SET aktif = $3, guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
     WHERE id = $1 AND surum = $2 RETURNING ${FIRMA}`,
    [id, surum, aktif, kisiId],
  );
}

// Adres yazması kartın sürümünü artırır: iki kişi aynı kartın adreslerini aynı anda değiştiremez (MT-11).
export function firmaSurumuArtir(db: Db, id: number, surum: number, kisiId: number): Promise<Firma | null> {
  return db.tek<Firma>(
    `UPDATE musteri_tedarikci_firma SET guncelleyen_id = $3, guncelleme = now(), surum = surum + 1
     WHERE id = $1 AND surum = $2 RETURNING ${FIRMA}`,
    [id, surum, kisiId],
  );
}

export async function firmaVarMi(db: Db, id: number): Promise<{ aktif: boolean } | null> {
  return db.tek<{ aktif: boolean }>('SELECT aktif FROM musteri_tedarikci_firma WHERE id = $1', [id]);
}

// 3473: bugünkü kod önce gelir; yoksa en son bırakılan eski kod (Logo'ya bağlanmadan önceki kodla hazırlanmış dosyalar için).
export async function firmaNoKoddan(db: Db, kod: string): Promise<number | null> {
  return (await db.tek<{ id: number }>(
    `SELECT id FROM (
       SELECT id, 0 AS sira, NULL::timestamptz AS zaman, 0 AS gid FROM musteri_tedarikci_firma WHERE kod = $1
       UNION ALL
       SELECT firma_id, 1, birakildi, id FROM musteri_tedarikci_kod_gecmisi WHERE kod = $1
     ) k ORDER BY sira, zaman DESC, gid DESC LIMIT 1`,
    [kod],
  ))?.id ?? null;
}
// Kod tekilliği büyük/küçük harfe bakmaz (musteri_tedarikci_firma_kod_tekil upper(kod)); sıra atlaması da öyle bakar.
// Bırakılmış eski kod da dolu sayılır: otomatik numara onu başka firmaya vermez (3473).
export async function firmaKoduVarMi(db: Db, kod: string): Promise<boolean> {
  return (await db.tek(
    `SELECT 1 FROM musteri_tedarikci_firma WHERE upper(kod) = upper($1)
     UNION ALL SELECT 1 FROM musteri_tedarikci_kod_gecmisi WHERE upper(kod) = upper($1) LIMIT 1`,
    [kod],
  )) !== null;
}
// Örnek veri kodları ORN- ile başlar; elle girilen firma bu öneki kullanırsa örnek veri yüklü sayılır.
export async function ornekFirmaVarMi(db: Db): Promise<boolean> {
  return (await db.tek("SELECT 1 FROM musteri_tedarikci_firma WHERE kod LIKE 'ORN-%' LIMIT 1")) !== null;
}

export function firmaAdlariniBul(db: Db, idler: number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM musteri_tedarikci_firma WHERE id = ANY($1::int[])', [idler]);
}

export function firmaLogoKodlariniBul(db: Db, idler: number[]): Promise<{ id: number; ad: string; logoKodu: string | null }[]> {
  return db.sorgu<{ id: number; ad: string; logoKodu: string | null }>('SELECT id, ad, logo_cari_kodu AS "logoKodu" FROM musteri_tedarikci_firma WHERE id = ANY($1::int[])', [idler]);
}

export function musteriSiniflariniBul(db: Db, idler: number[]): Promise<{ id: number; sinif: MusteriSinifi | null }[]> {
  return db.sorgu<{ id: number; sinif: MusteriSinifi | null }>('SELECT id, musteri_sinifi AS sinif FROM musteri_tedarikci_firma WHERE id = ANY($1::int[])', [idler]);
}

export function firmalariGetir(db: Db, idler: number[]): Promise<Firma[]> {
  return db.sorgu<Firma>(`SELECT ${FIRMA} FROM musteri_tedarikci_firma WHERE id = ANY($1::int[])`, [idler]);
}

export const tumFirmalar = (db: Db) =>
  db.sorgu<{ id: number; kod: string | null; ad: string; aktif: boolean; tur: FirmaTuru }>('SELECT id, kod, ad, aktif, tur FROM musteri_tedarikci_firma');

export interface SecimSatiri { id: number; kod: string | null; ad: string; tur: FirmaTuru; paraBirimi: string; vadeGunu: number | null }
export function firmaAra(
  db: Db, s: { metin: string | null; turler: FirmaTuru[] | null; yalnizAktif: boolean; sinir: number; fason?: boolean | null },
): Promise<SecimSatiri[]> {
  return db.sorgu<SecimSatiri>(
    `SELECT id, kod, ad, tur, para_birimi AS "paraBirimi", vade_gunu AS "vadeGunu"
       FROM musteri_tedarikci_firma
      WHERE ($1::text IS NULL OR public.arama_sade(ad) LIKE $1 OR public.arama_sade(kod) LIKE $1)
        AND ($2::text[] IS NULL OR tur = ANY($2::text[]))
        AND (NOT $3 OR aktif)
        AND ($5::boolean IS NULL OR fason = $5)
      ORDER BY lower(ad), id
      LIMIT $4`,
    [desen(s.metin), s.turler, s.yalnizAktif, s.sinir, s.fason ?? null],
  );
}

// Ctrl K kaynağı (kart 1235, sözleşme 1233): tam kod, koddan başlayan, addan başlayan önde; sonra yeni kart. Pasif de bulunur.
// Kodsuz kartta arama_sade boş döner (STRICT); karşılaştırma IS TRUE ile yanlış sayılır, boş değer üste çıkmaz.
export interface FirmaAramaSatiri { id: number; kod: string | null; ad: string; tur: FirmaTuru; fason: boolean; aktif: boolean }
export function kayitAra(db: Db, s: { sade: string; icinde: string; bas: string; sinir: number }): Promise<FirmaAramaSatiri[]> {
  return db.sorgu<FirmaAramaSatiri>(
    `SELECT id, kod, ad, tur, fason, aktif FROM musteri_tedarikci_firma
      WHERE public.arama_sade(kod) LIKE $1 OR public.arama_sade(ad) LIKE $1
      ORDER BY (public.arama_sade(kod) = $3) IS TRUE DESC, (public.arama_sade(kod) LIKE $2) IS TRUE DESC, (public.arama_sade(ad) LIKE $2) DESC, id DESC
      LIMIT $4`,
    [s.icinde, s.bas, s.sade, s.sinir],
  );
}

// ---- Adresler ----

export function adresleriGetir(db: Db, firmaId: number): Promise<Adres[]> {
  return db.sorgu<Adres>(
    `SELECT ${ADRES} FROM musteri_tedarikci_adres WHERE firma_id = $1
      ORDER BY array_position(ARRAY['fatura', 'teslim', 'sube'], tur), lower(ad), id`, [firmaId]);
}

export function firmalarinAdresleri(db: Db, firmaIdler: number[]): Promise<Adres[]> {
  return db.sorgu<Adres>(
    `SELECT ${ADRES} FROM musteri_tedarikci_adres WHERE firma_id = ANY($1::int[])
      ORDER BY firma_id, array_position(ARRAY['fatura', 'teslim', 'sube'], tur), lower(ad), id`, [firmaIdler]);
}

export async function adresSayisi(db: Db, firmaId: number): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_adres WHERE firma_id = $1', [firmaId]))?.n ?? 0;
}

export function adresEkle(db: Db, firmaId: number, a: AdresKimligi, kisiId: number): Promise<Adres | null> {
  return db.tek<Adres>(
    `INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, adres, ilce, il, posta_kodu, enlem, boylam, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${ADRES}`,
    [firmaId, a.tur, a.ad, a.adres, a.ilce, a.il, a.postaKodu, a.enlem, a.boylam, kisiId],
  );
}

export function adresGuncelle(db: Db, firmaId: number, adresId: number, a: AdresKimligi, kisiId: number): Promise<Adres | null> {
  return db.tek<Adres>(
    `UPDATE musteri_tedarikci_adres SET tur = $3, ad = $4, adres = $5, ilce = $6, il = $7, posta_kodu = $8, enlem = $9, boylam = $10,
       guncelleyen_id = $11, guncelleme = now()
     WHERE id = $2 AND firma_id = $1 RETURNING ${ADRES}`,
    [firmaId, adresId, a.tur, a.ad, a.adres, a.ilce, a.il, a.postaKodu, a.enlem, a.boylam, kisiId],
  );
}

export async function adresSil(db: Db, firmaId: number, adresId: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('DELETE FROM musteri_tedarikci_adres WHERE id = $2 AND firma_id = $1 RETURNING id', [firmaId, adresId])) !== null;
}

// ---- Tedarikçi karnesi (1259 c) ----

export interface KarneOlayiSatiri {
  firmaId: number; kaynak: string; anahtar: string; tur: 'teslim' | 'lot'; zaman: string;
  termin: string | null; teslimGunu: string | null; tam: boolean | null; lotKarari: LotKarari | null;
}
// Aynı kaynak ve anahtar yeniden gelirse (karar değişti, geri doldurma tekrarlandı) satır güncellenir; firma da değişebilir.
export async function karneOlayiYaz(db: Db, o: KarneOlayiSatiri): Promise<void> {
  await db.sorgu(
    `INSERT INTO musteri_tedarikci_karne_olayi (firma_id, kaynak, anahtar, tur, zaman, termin, teslim_gunu, tam, lot_karari)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (kaynak, anahtar) DO UPDATE SET firma_id = EXCLUDED.firma_id, tur = EXCLUDED.tur, zaman = EXCLUDED.zaman,
       termin = EXCLUDED.termin, teslim_gunu = EXCLUDED.teslim_gunu, tam = EXCLUDED.tam, lot_karari = EXCLUDED.lot_karari, guncelleme = now()`,
    [o.firmaId, o.kaynak, o.anahtar, o.tur, o.zaman, o.termin, o.teslimGunu, o.tam, o.lotKarari],
  );
}

// Teslim dönemi terminle, lot ve hizmet puanı tesis günündeki zamanıyla seçilir; zamanında hesabı kurallardadır (MT-15).
export interface TeslimGrubu { firmaId: number; termin: string; teslimGunu: string; tam: boolean; sayi: number }
export function teslimGruplari(db: Db, idler: readonly number[], donemBasi: string, donemSonu: string): Promise<TeslimGrubu[]> {
  return db.sorgu<TeslimGrubu>(
    `SELECT firma_id AS "firmaId", termin::text AS termin, teslim_gunu::text AS "teslimGunu", tam, count(*)::int AS sayi
       FROM musteri_tedarikci_karne_olayi
      WHERE tur = 'teslim' AND firma_id = ANY($1::int[]) AND termin BETWEEN $2::date AND $3::date
      GROUP BY firma_id, termin, teslim_gunu, tam`,
    [idler, donemBasi, donemSonu],
  );
}

// Kart 1474: kaynağın kaydı geri alınınca (mal kabul düzeltmesi) olay da kalkar; yoksa sessizce geçer.
export async function karneOlayiKaldir(db: Db, kaynak: string, anahtar: string): Promise<void> {
  await db.sorgu('DELETE FROM musteri_tedarikci_karne_olayi WHERE kaynak = $1 AND anahtar = $2', [kaynak, anahtar]);
}

// Kart 1474: gecikme dönemi teslim gününe göre seçilir (geçmiş, gerçekleşen teslimdir); yalnız tam teslim.
export interface GecikmeGrubu { firmaId: number; kaynak: KarneOlayKaynagi; termin: string; teslimGunu: string; sayi: number }
export function gecikmeGruplari(db: Db, idler: readonly number[], donemBasi: string, donemSonu: string): Promise<GecikmeGrubu[]> {
  return db.sorgu<GecikmeGrubu>(
    `SELECT firma_id AS "firmaId", kaynak, termin::text AS termin, teslim_gunu::text AS "teslimGunu", count(*)::int AS sayi
       FROM musteri_tedarikci_karne_olayi
      WHERE tur = 'teslim' AND tam AND firma_id = ANY($1::int[]) AND teslim_gunu BETWEEN $2::date AND $3::date
      GROUP BY firma_id, kaynak, termin, teslim_gunu`,
    [idler, donemBasi, donemSonu],
  );
}

export interface LotGrubu { firmaId: number; lotKarari: LotKarari; sayi: number }
export function lotGruplari(db: Db, idler: readonly number[], donemBasi: string, donemSonu: string, saatDilimi: string): Promise<LotGrubu[]> {
  return db.sorgu<LotGrubu>(
    `SELECT firma_id AS "firmaId", lot_karari AS "lotKarari", count(*)::int AS sayi
       FROM musteri_tedarikci_karne_olayi
      WHERE tur = 'lot' AND firma_id = ANY($1::int[]) AND (zaman AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      GROUP BY firma_id, lot_karari`,
    [idler, donemBasi, donemSonu, saatDilimi],
  );
}

export interface HizmetGrubu { firmaId: number; tur: EllePuanTuru; sayi: number; toplam: number }
export function hizmetGruplari(db: Db, idler: readonly number[], donemBasi: string, donemSonu: string, saatDilimi: string): Promise<HizmetGrubu[]> {
  return db.sorgu<HizmetGrubu>(
    `SELECT firma_id AS "firmaId", tur, count(*)::int AS sayi, sum(puan)::int AS toplam
       FROM musteri_tedarikci_hizmet_puani
      WHERE firma_id = ANY($1::int[]) AND (olusturma AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      GROUP BY firma_id, tur`,
    [idler, donemBasi, donemSonu, saatDilimi],
  );
}

export interface HizmetPuaniSatiri { id: number; puan: number; tur: EllePuanTuru; not: string | null; girenId: number; olusturma: string }
export function hizmetPuaniEkle(
  db: Db, firmaId: number, tur: EllePuanTuru, puan: number, not: string | null, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'INSERT INTO musteri_tedarikci_hizmet_puani (firma_id, tur, puan, "not", giren_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [firmaId, tur, puan, not, kisiId],
  );
}
export function hizmetPuanlari(db: Db, firmaId: number, sinir: number): Promise<HizmetPuaniSatiri[]> {
  return db.sorgu<HizmetPuaniSatiri>(
    `SELECT id, puan, tur, "not", giren_id AS "girenId", ${zamanMetni('olusturma')} AS olusturma
       FROM musteri_tedarikci_hizmet_puani WHERE firma_id = $1 ORDER BY olusturma DESC, id DESC LIMIT $2`,
    [firmaId, sinir],
  );
}

export interface YillikKarneSatiri {
  id: number; firmaId: number; yil: number; teslimOrani: number | null; kalitePuani: number | null; hizmetPuani: number | null;
  puan: number | null; sinif: KarneSinifi | null; not: string | null; degerlendirenId: number; olusturma: string;
  hesapSurumu: number | null; bilesenler: KarneBilesenSatiri[] | null;
}
const YILLIK = `id, firma_id AS "firmaId", yil, teslim_orani::float8 AS "teslimOrani", kalite_puani::float8 AS "kalitePuani",
  hizmet_puani::float8 AS "hizmetPuani", puan::float8 AS puan, sinif, "not", degerlendiren_id AS "degerlendirenId", ${zamanMetni('olusturma')} AS olusturma,
  hesap_surumu AS "hesapSurumu", bilesenler`;
export function yillikKarneEkle(
  db: Db, k: Omit<YillikKarneSatiri, 'id' | 'olusturma'>,
): Promise<YillikKarneSatiri | null> {
  return db.tek<YillikKarneSatiri>(
    `INSERT INTO musteri_tedarikci_yillik_karne
       (firma_id, yil, teslim_orani, kalite_puani, hizmet_puani, puan, sinif, "not", degerlendiren_id, hesap_surumu, bilesenler)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING ${YILLIK}`,
    [k.firmaId, k.yil, k.teslimOrani, k.kalitePuani, k.hizmetPuani, k.puan, k.sinif, k.not, k.degerlendirenId, k.hesapSurumu,
      k.bilesenler === null ? null : JSON.stringify(k.bilesenler)],
  );
}
export function yillikKarneler(db: Db, firmaId: number, sinir: number): Promise<YillikKarneSatiri[]> {
  return db.sorgu<YillikKarneSatiri>(
    `SELECT ${YILLIK} FROM musteri_tedarikci_yillik_karne WHERE firma_id = $1 ORDER BY yil DESC LIMIT $2`, [firmaId, sinir]);
}

// ---- Karne ağırlıkları (2456) ----

export interface AgirlikSatiri { surum: number; agirliklar: KarneAgirliklari; gerekce: string; degistirenId: number | null; olusturma: string }
const AGIRLIK = `surum, jsonb_build_object('lot', lot, 'ppm', ppm, 'zamaninda', zamaninda, 'tam', tam, 'teklif', teklif,
  'satinAlma', satin_alma, 'kalite', kalite) AS agirliklar, gerekce, degistiren_id AS "degistirenId", ${zamanMetni('olusturma')} AS olusturma`;
// kilitle: değişiklik geçerli satırı kilitler; eş zamanlı ikinci değişiklik sürüm denetiminde çakışma alır.
export function gecerliAgirlik(db: Db, kilitle = false): Promise<AgirlikSatiri | null> {
  return db.tek<AgirlikSatiri>(
    `SELECT ${AGIRLIK} FROM musteri_tedarikci_karne_agirlik ORDER BY surum DESC LIMIT 1${kilitle ? ' FOR UPDATE' : ''}`);
}
export function agirlikGecmisi(db: Db, sinir: number): Promise<AgirlikSatiri[]> {
  return db.sorgu<AgirlikSatiri>(`SELECT ${AGIRLIK} FROM musteri_tedarikci_karne_agirlik ORDER BY surum DESC LIMIT $1`, [sinir]);
}
export async function agirlikEkle(db: Db, surum: number, a: KarneAgirliklari, gerekce: string, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO musteri_tedarikci_karne_agirlik (surum, lot, ppm, zamaninda, tam, teklif, satin_alma, kalite, gerekce, degistiren_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [surum, a.lot, a.ppm, a.zamaninda, a.tam, a.teklif, a.satinAlma, a.kalite, gerekce, kisiId],
  );
}

export interface DegerlendirilecekFirma { id: number; kod: string | null; ad: string; fason: boolean }
export function degerlendirilecekFirmalar(db: Db, sinir: number): Promise<DegerlendirilecekFirma[]> {
  return db.sorgu<DegerlendirilecekFirma>(
    `SELECT id, kod, ad, fason FROM musteri_tedarikci_firma
      WHERE aktif AND tur IN ('tedarikci', 'ikisi') ORDER BY ad, id LIMIT $1`,
    [sinir],
  );
}

// 2118: Logo carisiyle eşleşebilecek firmalar (kayıt no, cari kodu ya da kod, vergi no). Kodlar büyük harfle gelir (tekil indeks gibi).
export interface LogoCariAdaySatiri {
  id: number; kod: string | null; ad: string; vergiNo: string | null; logoKayitNo: number | null; logoCariKodu: string | null; surum: number;
}
export function logoCariAdaylari(db: Db, a: { kayitNolar: number[]; kodlar: string[]; vergiNolar: string[] }): Promise<LogoCariAdaySatiri[]> {
  return db.sorgu<LogoCariAdaySatiri>(
    `SELECT id, kod, ad, vergi_no AS "vergiNo", logo_kayit_no AS "logoKayitNo", logo_cari_kodu AS "logoCariKodu", surum
       FROM musteri_tedarikci_firma
      WHERE logo_kayit_no = ANY($1::int[]) OR upper(logo_cari_kodu) = ANY($2::text[]) OR upper(kod) = ANY($2::text[])
         OR vergi_no = ANY($3::text[])
      ORDER BY id`,
    [a.kayitNolar, a.kodlar, a.vergiNolar],
  );
}

// 3473: bağlanınca kod Logo cari kodu olur; bu kod başka firmanın bugünkü kodu ise bağlama durur.
export function koduKullananFirma(db: Db, kod: string, haricId: number): Promise<{ id: number; kod: string; ad: string } | null> {
  return db.tek('SELECT id, kod, ad FROM musteri_tedarikci_firma WHERE upper(kod) = upper($1) AND id <> $2 LIMIT 1', [kod, haricId]);
}

// 3474-1: Logo geçişi listesi; aynadaki kodlarla kodu ya da Logo cari kodu tutan firmalar (büyük harfle karşılaştırılır).
export function aynaAdaylari(db: Db, kodlar: readonly string[]): Promise<{ id: number; kod: string | null; ad: string; aktif: boolean; logoKayitNo: number | null; logoCariKodu: string | null; surum: number }[]> {
  return db.sorgu(
    `SELECT id, kod, ad, aktif, logo_kayit_no AS "logoKayitNo", logo_cari_kodu AS "logoCariKodu", surum
       FROM musteri_tedarikci_firma
      WHERE upper(logo_cari_kodu) = ANY($1::text[]) OR upper(kod) = ANY($1::text[])
      ORDER BY id`,
    [kodlar.map((k) => k.toUpperCase())],
  );
}

export interface LogoGecisIzi {
  sira: number; tur: 'al' | 'bagla'; logoKodu: string; tamam: boolean; firmaId: number | null; ileti: string | null; firmaSurumu: number | null;
  onceki: LogoBagOncesi | null;
}
export interface LogoBagOncesi { kod: string | null; logoCariKodu: string | null; logoGonderimDurumu: string | null }
export async function logoGecisIziYaz(db: Db, islem: string, kisiId: number, izler: readonly LogoGecisIzi[]): Promise<void> {
  if (izler.length === 0) return;
  await db.sorgu(
    `INSERT INTO musteri_tedarikci_logo_gecis_izi (islem, sira, tur, logo_kodu, tamam, firma_id, ileti, firma_surumu, onceki, kisi_id)
     SELECT $1, t.sira, t.tur, t.logo_kodu, t.tamam, t.firma_id, t.ileti, t.firma_surumu, t.onceki, $2
       FROM jsonb_to_recordset($3::jsonb) AS t(sira int, tur text, logo_kodu text, tamam boolean, firma_id int, ileti text, firma_surumu int, onceki jsonb)`,
    [islem, kisiId, JSON.stringify(izler.map((i) => ({
      sira: i.sira, tur: i.tur, logo_kodu: i.logoKodu, tamam: i.tamam, firma_id: i.firmaId, ileti: i.ileti === null ? null : i.ileti.slice(0, 500),
      firma_surumu: i.firmaSurumu, onceki: i.onceki,
    })))],
  );
}

export interface LogoGecisIziSatiri {
  id: number; islem: string; zaman: Date; sira: number; tur: 'al' | 'bagla'; logoKodu: string; tamam: boolean; ileti: string | null;
  firmaSurumu: number | null; onceki: LogoBagOncesi | null; geriAlindi: Date | null; geriIleti: string | null;
  firma: { id: number; kod: string | null; ad: string; surum: number; aktif: boolean; logoKayitNo: number | null } | null;
}
// Kişinin son işlemi ya da verilen işlem (yalnız o kişinin); satırlar işlem sırasıyla. Geri almada satırlar kilitlenir.
export async function logoGecisIzleri(db: Db, kisiId: number, islem: string | null, kilitle = false): Promise<LogoGecisIziSatiri[]> {
  const hedef = islem ?? (await db.tek<{ islem: string }>(
    'SELECT islem FROM musteri_tedarikci_logo_gecis_izi WHERE kisi_id = $1 ORDER BY zaman DESC, id DESC LIMIT 1', [kisiId],
  ))?.islem ?? null;
  if (hedef === null) return [];
  return db.sorgu<LogoGecisIziSatiri>(
    `SELECT i.id, i.islem, i.zaman, i.sira, i.tur, i.logo_kodu AS "logoKodu", i.tamam, i.ileti, i.firma_surumu AS "firmaSurumu", i.onceki,
            i.geri_alindi AS "geriAlindi", i.geri_ileti AS "geriIleti",
            CASE WHEN f.id IS NULL THEN NULL ELSE json_build_object('id', f.id, 'kod', f.kod, 'ad', f.ad, 'surum', f.surum, 'aktif', f.aktif, 'logoKayitNo', f.logo_kayit_no) END AS firma
       FROM musteri_tedarikci_logo_gecis_izi i
       LEFT JOIN musteri_tedarikci_firma f ON f.id = i.firma_id
      WHERE i.kisi_id = $1 AND i.islem = $2
      ORDER BY i.sira${kilitle ? ' FOR UPDATE OF i' : ''}`,
    [kisiId, hedef],
  );
}
export async function logoGecisIziGeriAlindi(db: Db, id: number, ileti: string | null): Promise<void> {
  await db.sorgu(
    `UPDATE musteri_tedarikci_logo_gecis_izi SET geri_alindi = CASE WHEN $2::text IS NULL THEN now() END, geri_ileti = $2 WHERE id = $1`,
    [id, ileti === null ? null : ileti.slice(0, 500)],
  );
}

// Bağlamanın geri alınması: önce Logo kaydı boşaltılır (kod kilidi Logo kaydı varken kodu korur, MT-5), sonra önceki kod ve Logo cari
// kodu geri yazılır. İki yazım tek sürüm artışı sayılmaz: her biri sürümü artırır. Bağlamanın kod geçmişine yazdığı eski kod satırı
// silinir (3473): kod yeniden firmanın bugünkü kodu olur, geçmişte ikinci kez durmaz.
export async function logoBaginiGeriAl(db: Db, id: number, surum: number, o: LogoBagOncesi, kisiId: number, baglanma: Date): Promise<boolean> {
  const bos = await db.tek<{ id: number }>(
    `UPDATE musteri_tedarikci_firma
        SET logo_kayit_no = NULL, logo_gonderim_durumu = $3, guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, o.logoGonderimDurumu, kisiId],
  );
  if (bos === null) return false;
  await db.sorgu(
    `UPDATE musteri_tedarikci_firma
        SET kod = $2, logo_cari_kodu = $3, logo_crm_kodu = CASE WHEN upper(logo_cari_kodu) IS NOT DISTINCT FROM upper($3) THEN logo_crm_kodu END,
            guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1`,
    [id, o.kod, o.logoCariKodu, kisiId],
  );
  if (o.kod !== null) {
    await db.sorgu(
      'DELETE FROM musteri_tedarikci_kod_gecmisi WHERE firma_id = $1 AND kod = $2 AND birakildi >= $3',
      [id, o.kod, baglanma],
    );
  }
  return true;
}

// 3473: bağlama Logo kayıt numarasını, Logo cari kodunu ve firma kodunu Logo cari kodu yapar; farklı eski kod geçmişe yazılır.
// Firma Logo'ya bağlı değilken ve cari kodu boş ya da aynıyken (kod kilidi tetikte; bağlanmamış firmada kod değişebilir).
const BAGLANABILIR = 'id = $1 AND surum = $2 AND logo_kayit_no IS NULL AND (logo_cari_kodu IS NULL OR upper(logo_cari_kodu) = upper($3))';
export async function logoBagiYaz(
  db: Db, id: number, surum: number, b: { logoCariKodu: string; logoKayitNo: number }, kisiId: number,
): Promise<Firma | null> {
  await db.sorgu(
    `INSERT INTO musteri_tedarikci_kod_gecmisi (firma_id, kod, birakan_id)
     SELECT id, kod, $4 FROM musteri_tedarikci_firma WHERE ${BAGLANABILIR} AND kod IS NOT NULL AND kod <> $3`,
    [id, surum, b.logoCariKodu, kisiId],
  );
  return db.tek<Firma>(
    `UPDATE musteri_tedarikci_firma
        SET kod = $3, logo_cari_kodu = $3, logo_kayit_no = $4, logo_gonderim_durumu = 'gonderildi', guncelleyen_id = $5, guncelleme = now(), surum = surum + 1
      WHERE ${BAGLANABILIR}
      RETURNING ${FIRMA}`,
    [id, surum, b.logoCariKodu, b.logoKayitNo, kisiId],
  );
}
