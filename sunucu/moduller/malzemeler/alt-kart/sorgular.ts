import type { Db } from '#cekirdek/db.ts';
import type { AltKartTuru, RevizyonDurumu } from '#paylasilan/sozlesme/malzeme-alt-kart.ts';

export interface AltKartSatiri {
  no: number;
  kimlik: string;
  tur: string;
  stokKodu: string;
  ad: string | null;
  onayDurumu: string;
  anaKartNo: number | null;
  altTur: AltKartTuru | null;
  altEtiket: string | null;
  revDurumu: RevizyonDurumu | null;
  // Kartın çizim revizyonu alanı (g.rev); yalnız yarı mamul ve mamulde anlamlı.
  cizimRev: string | null;
  altSayisi: number;
}

const ALANLAR = `k.no, k.kimlik, k.tur, k.stok_kodu AS "stokKodu",
  NULLIF(btrim(k.kayit #>> '{com,ad}'), '') AS ad, k.onay_durumu AS "onayDurumu", k.ana_kart_no AS "anaKartNo", k.alt_tur AS "altTur",
  k.alt_etiket AS "altEtiket", k.rev_durumu AS "revDurumu",
  CASE WHEN jsonb_typeof(k.kayit #> '{g,rev}') = 'string' THEN NULLIF(btrim(k.kayit #>> '{g,rev}'), '') END AS "cizimRev",
  (SELECT count(*)::int FROM malzeme_katalog_karti c WHERE c.ana_kart_no = k.no) AS "altSayisi"`;

export function altKartSatiri(db: Db, kimlik: string): Promise<AltKartSatiri | null> {
  return db.tek<AltKartSatiri>(`SELECT ${ALANLAR} FROM malzeme_katalog_karti k WHERE k.kimlik = $1`, [kimlik]);
}

// Ailenin bütün kartları kilitlenir (ana kart önce): yürürlüğe alma ve bağlama aynı ailede sırayla yürür.
export async function aileyiKilitle(db: Db, anaNo: number): Promise<void> {
  await db.sorgu('SELECT 1 FROM malzeme_katalog_karti WHERE no = $1 OR ana_kart_no = $1 ORDER BY (no = $1) DESC, no FOR UPDATE', [anaNo]);
}

// İptal kart ailede gösterilmez.
export function aileSatirlari(db: Db, anaNo: number): Promise<AltKartSatiri[]> {
  return db.sorgu<AltKartSatiri>(
    `SELECT ${ALANLAR} FROM malzeme_katalog_karti k WHERE (k.no = $1 OR k.ana_kart_no = $1) AND k.onay_durumu <> 'iptal' ORDER BY (k.no = $1) DESC, k.no`,
    [anaNo],
  );
}

export function anaKartNoKimlikle(db: Db, kimlik: string): Promise<{ no: number } | null> {
  return db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
}

// Kaydı değiştiren yazma sürümü ve güncelleme anını artırır: istemcinin değişenler okuması kartı yeniden alır.
export async function altBagYaz(
  db: Db, no: number, b: { anaKartNo: number | null; altTur: AltKartTuru | null; altEtiket: string | null; revDurumu: RevizyonDurumu | null }, kisiId: number,
): Promise<void> {
  await db.sorgu(
    `UPDATE malzeme_katalog_karti SET ana_kart_no = $2, alt_tur = $3, alt_etiket = $4, rev_durumu = $5,
            surum = surum + 1, guncelleyen_kisi_id = $6, guncelleme = now()
      WHERE no = $1`,
    [no, b.anaKartNo, b.altTur, b.altEtiket, b.revDurumu, kisiId],
  );
}

export async function revDurumuYaz(db: Db, no: number, durum: RevizyonDurumu | null, kisiId: number): Promise<void> {
  await db.sorgu(
    'UPDATE malzeme_katalog_karti SET rev_durumu = $2, surum = surum + 1, guncelleyen_kisi_id = $3, guncelleme = now() WHERE no = $1',
    [no, durum, kisiId],
  );
}

// Verilen kartların ailesindeki yürürlükteki revizyon kartı. Revizyonu olmayan kart haritada yoktur.
export interface RevizyonSatiri {
  no: number; etiket: string | null; revDurumu: RevizyonDurumu; yururlukteNo: number; yururlukteKodu: string; yururlukteEtiketi: string | null;
}
const ETIKET = (t: string) => `coalesce(${t}.alt_etiket, CASE WHEN jsonb_typeof(${t}.kayit #> '{g,rev}') = 'string' THEN NULLIF(btrim(${t}.kayit #>> '{g,rev}'), '') END)`;
export function revizyonSatirlari(db: Db, nolar: readonly number[]): Promise<RevizyonSatiri[]> {
  return db.sorgu(
    `SELECT s.no, ${ETIKET('s')} AS etiket, s.rev_durumu AS "revDurumu",
            y.no AS "yururlukteNo", y.stok_kodu AS "yururlukteKodu", ${ETIKET('y')} AS "yururlukteEtiketi"
       FROM malzeme_katalog_karti s
       JOIN malzeme_katalog_karti y ON coalesce(y.ana_kart_no, y.no) = coalesce(s.ana_kart_no, s.no) AND y.rev_durumu = 'yururlukte'
      WHERE s.no = ANY($1::int[]) AND s.rev_durumu IS NOT NULL`,
    [[...new Set(nolar)]],
  );
}
