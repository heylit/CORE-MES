import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { Adres, AdresKimligi, Firma, FirmaKimligi, FirmaSatiri, FirmaTuru, MusteriSinifi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Koordinat numeric(9,6) sütunudur; ekrana ve sözleşmeye sayı gider (altı ondalık float8'de kaybolmaz).
const FIRMA = `id, kod, ad, tur, fason, ulke_kodu AS "ulkeKodu", vergi_no AS "vergiNo", vergi_dairesi AS "vergiDairesi",
  para_birimi AS "paraBirimi", vade_gunu AS "vadeGunu", adres, ilce, il, posta_kodu AS "postaKodu", enlem::float8 AS enlem, boylam::float8 AS boylam,
  telefon, e_posta AS "ePosta", aktif, logo_cari_kodu AS "logoCariKodu", logo_kayit_no AS "logoKayitNo", logo_gonderim_durumu AS "logoGonderimDurumu",
  musteri_sinifi AS "musteriSinifi", ${zamanMetni('olusturma')} AS olusturma, ${zamanMetni('guncelleme')} AS guncelleme, surum`;
const SATIR = `f.id, f.kod, f.ad, f.tur, f.fason, f.vergi_no AS "vergiNo", f.il, f.aktif, f.logo_cari_kodu AS "logoCariKodu",
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
// Arama metni SQL'e yazılmaz; parametredir. LIKE yerine konum araması: % ve _ özel anlam taşımaz.
const SUZGEC = `FROM musteri_tedarikci_firma f
  WHERE ($1::text IS NULL OR strpos(lower(f.ad), lower($1)) > 0 OR strpos(lower(coalesce(f.kod, '')), lower($1)) > 0
         OR strpos(coalesce(f.vergi_no, ''), $1) > 0)
    AND ($2::text[] IS NULL OR f.tur = ANY($2::text[]))
    AND ($3::boolean IS NULL OR f.fason = $3)
    AND ($4::boolean IS NULL OR f.aktif = $4)`;
const suzgecParametreleri = (s: FirmaSuzgeci) => [s.ara, s.turler, s.fason, s.aktif];

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
       e_posta = $19, logo_cari_kodu = $20, guncelleyen_id = $21, musteri_sinifi = $22, guncelleme = now(), surum = surum + 1
     WHERE id = $1 AND surum = $2
     RETURNING ${FIRMA}`,
    [id, surum, k.kod, k.ad, k.tur, k.fason, k.ulkeKodu, k.vergiNo, k.vergiDairesi, k.paraBirimi, k.vadeGunu, k.adres, k.ilce, k.il,
      k.postaKodu, k.enlem, k.boylam, k.telefon, k.ePosta, k.logoCariKodu, kisiId, k.musteriSinifi],
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

export async function firmaNoKoddan(db: Db, kod: string): Promise<number | null> {
  return (await db.tek<{ id: number }>('SELECT id FROM musteri_tedarikci_firma WHERE kod = $1', [kod]))?.id ?? null;
}
// Örnek veri kodları ORN- ile başlar; elle girilen firma bu öneki kullanırsa örnek veri yüklü sayılır.
export async function ornekFirmaVarMi(db: Db): Promise<boolean> {
  return (await db.tek("SELECT 1 FROM musteri_tedarikci_firma WHERE kod LIKE 'ORN-%' LIMIT 1")) !== null;
}

export function firmaAdlariniBul(db: Db, idler: number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM musteri_tedarikci_firma WHERE id = ANY($1::int[])', [idler]);
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
      WHERE ($1::text IS NULL OR strpos(lower(ad), lower($1)) > 0 OR strpos(lower(coalesce(kod, '')), lower($1)) > 0)
        AND ($2::text[] IS NULL OR tur = ANY($2::text[]))
        AND (NOT $3 OR aktif)
        AND ($5::boolean IS NULL OR fason = $5)
      ORDER BY lower(ad), id
      LIMIT $4`,
    [s.metin, s.turler, s.yalnizAktif, s.sinir, s.fason ?? null],
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
