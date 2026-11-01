import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import type {
  Adres, AdresKimligi, Firma, FirmaKimligi, FirmaSatiri, FirmaTuru, KarneOlayKaynagi, KarneSinifi, LotKarari, MusteriSinifi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';

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
// Arama metni SQL'e yazılmaz; sadeleşmiş, kaçırılmış desen parametresidir (\, % ve _ harf sayılır). Sütun ve desen aynı
// Türkçe harf sadeleştirmesinden geçer (public.arama_sade, göç 20261029125000): ILIKE ve lower() veritabanının dil ayarına
// bağlıdır, 'IŞIK' ile 'ışık'ı eşlemez. İfade trigram indeksinin aynısıdır (göç 20261029127000). Desen yoksa süzgeç yoktur.
const desen = (metin: string | null): string | null => (metin === null ? null : icindeDeseni(metin));
const SUZGEC = `FROM musteri_tedarikci_firma f
  WHERE ($1::text IS NULL OR public.arama_sade(f.ad) LIKE $1 OR public.arama_sade(f.kod) LIKE $1 OR public.arama_sade(f.vergi_no) LIKE $1)
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

export interface HizmetGrubu { firmaId: number; sayi: number; toplam: number }
export function hizmetGruplari(db: Db, idler: readonly number[], donemBasi: string, donemSonu: string, saatDilimi: string): Promise<HizmetGrubu[]> {
  return db.sorgu<HizmetGrubu>(
    `SELECT firma_id AS "firmaId", count(*)::int AS sayi, sum(puan)::int AS toplam
       FROM musteri_tedarikci_hizmet_puani
      WHERE firma_id = ANY($1::int[]) AND (olusturma AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      GROUP BY firma_id`,
    [idler, donemBasi, donemSonu, saatDilimi],
  );
}

export interface HizmetPuaniSatiri { id: number; puan: number; not: string | null; girenId: number; olusturma: string }
export function hizmetPuaniEkle(db: Db, firmaId: number, puan: number, not: string | null, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'INSERT INTO musteri_tedarikci_hizmet_puani (firma_id, puan, "not", giren_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [firmaId, puan, not, kisiId],
  );
}
export function hizmetPuanlari(db: Db, firmaId: number, sinir: number): Promise<HizmetPuaniSatiri[]> {
  return db.sorgu<HizmetPuaniSatiri>(
    `SELECT id, puan, "not", giren_id AS "girenId", ${zamanMetni('olusturma')} AS olusturma
       FROM musteri_tedarikci_hizmet_puani WHERE firma_id = $1 ORDER BY olusturma DESC, id DESC LIMIT $2`,
    [firmaId, sinir],
  );
}

export interface YillikKarneSatiri {
  id: number; firmaId: number; yil: number; teslimOrani: number | null; kalitePuani: number | null; hizmetPuani: number | null;
  puan: number | null; sinif: KarneSinifi | null; not: string | null; degerlendirenId: number; olusturma: string;
}
const YILLIK = `id, firma_id AS "firmaId", yil, teslim_orani::float8 AS "teslimOrani", kalite_puani::float8 AS "kalitePuani",
  hizmet_puani::float8 AS "hizmetPuani", puan::float8 AS puan, sinif, "not", degerlendiren_id AS "degerlendirenId", ${zamanMetni('olusturma')} AS olusturma`;
export function yillikKarneEkle(
  db: Db, k: Omit<YillikKarneSatiri, 'id' | 'olusturma'>,
): Promise<YillikKarneSatiri | null> {
  return db.tek<YillikKarneSatiri>(
    `INSERT INTO musteri_tedarikci_yillik_karne (firma_id, yil, teslim_orani, kalite_puani, hizmet_puani, puan, sinif, "not", degerlendiren_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${YILLIK}`,
    [k.firmaId, k.yil, k.teslimOrani, k.kalitePuani, k.hizmetPuani, k.puan, k.sinif, k.not, k.degerlendirenId],
  );
}
export function yillikKarneler(db: Db, firmaId: number, sinir: number): Promise<YillikKarneSatiri[]> {
  return db.sorgu<YillikKarneSatiri>(
    `SELECT ${YILLIK} FROM musteri_tedarikci_yillik_karne WHERE firma_id = $1 ORDER BY yil DESC LIMIT $2`, [firmaId, sinir]);
}
