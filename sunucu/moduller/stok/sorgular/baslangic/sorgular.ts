import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { BaslangicDuzeltmesi, CikisNedeni, HareketTuru, KonumTuru } from '#paylasilan/sozlesme/stok.ts';

// Başlangıç stoğu (3129): satır başına sorgu atılmaz; kodlar, lotlar ve göz bakiyeleri toplu okunur.
export interface BaslangicKonumu { id: number; kod: string; tur: KonumTuru; aktif: boolean }
// Konum kodu büyük-küçük harf gözetmeden eşlenir (etiketteki kod büyük harftir, Excel'de küçük yazılmış olabilir).
export const konumlarKodlarla = (db: Db, kodlar: readonly string[]): Promise<BaslangicKonumu[]> => (kodlar.length === 0 ? Promise.resolve([]) : db.sorgu(
  'SELECT id, kod, tur, aktif FROM stok_konum WHERE upper(kod) = ANY($1::text[]) ORDER BY aktif DESC, id', [kodlar.map((k) => k.toUpperCase())]));
export const konumlarIdlerle = (db: Db, idler: readonly number[]): Promise<BaslangicKonumu[]> => (idler.length === 0 ? Promise.resolve([]) : db.sorgu(
  'SELECT id, kod, tur, aktif FROM stok_konum WHERE id = ANY($1::int[])', [[...idler]]));

export interface BaslangicLotu { id: number; malzemeId: number; lotNo: string; uretimEmriId: number | null; sonKullanma: string | null }
export const lotlarNoyla = (db: Db, nolar: readonly string[]): Promise<BaslangicLotu[]> => (nolar.length === 0 ? Promise.resolve([]) : db.sorgu(
  `SELECT p.id, p.malzeme_id AS "malzemeId", p.lot_no AS "lotNo", p.uretim_emri_id AS "uretimEmriId", t.son_kullanma::text AS "sonKullanma"
     FROM stok_parti p LEFT JOIN stok_parti_son_kullanma t ON t.parti_id = p.id WHERE upper(p.lot_no) = ANY($1::text[])`, [nolar.map((n) => n.toUpperCase())]));

// Gözdeki toplam bakiye (malzeme, konum); satır yoksa haritada yok.
export async function gozBakiyeleri(db: Db, ciftler: readonly { malzemeId: number; konumId: number }[]): Promise<Map<string, string>> {
  if (ciftler.length === 0) return new Map();
  const l = await db.sorgu<{ malzemeId: number; konumId: number; miktar: string }>(
    `SELECT b.malzeme_id AS "malzemeId", b.konum_id AS "konumId", sum(b.miktar)::text AS miktar
       FROM stok_bakiye b JOIN (SELECT DISTINCT m, k FROM unnest($1::int[], $2::int[]) AS u(m, k)) c ON c.m = b.malzeme_id AND c.k = b.konum_id
      GROUP BY b.malzeme_id, b.konum_id HAVING sum(b.miktar) <> 0`,
    [ciftler.map((c) => c.malzemeId), ciftler.map((c) => c.konumId)]);
  return new Map(l.map((x) => [`${x.malzemeId}:${x.konumId}`, x.miktar]));
}

// Aynı dosyanın geri alınmamış belgesi (Risk K1: geri alınan dosya yeniden yüklenebilir).
export const tekrarBelgesi = (db: Db, ozet: string): Promise<{ id: number; no: string } | null> => db.tek(
  `SELECT m.id, m.no FROM stok_mal_kabul m WHERE m.tur = 'baslangic' AND m.dosya_ozeti = $1
      AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id) ORDER BY m.id LIMIT 1`, [ozet]);
// İki yükleme aynı anda gelirse ikincisi birincinin bitmesini bekler; tekrar denetimi böylece yarışsızdır.
export async function baslangicKilidi(db: Db): Promise<void> {
  await db.sorgu("SELECT pg_advisory_xact_lock(hashtext('stok.baslangic-stogu'))");
}
export const baslangicBelgesiAc = async (db: Db, b: {
  no: string; kisiId: number; dosyaOzeti: string; dosyaAdi: string; duzeltmeler: readonly BaslangicDuzeltmesi[];
}): Promise<number> => (await db.tek<{ id: number }>(
  `INSERT INTO stok_mal_kabul (no, tur, kisi_id, dosya_ozeti, dosya_adi, duzeltmeler) VALUES ($1, 'baslangic', $2, $3, $4, $5::jsonb) RETURNING id`,
  [b.no, b.kisiId, b.dosyaOzeti, b.dosyaAdi, JSON.stringify(b.duzeltmeler)]))!.id;
export const baslangicBilgisi = (db: Db, id: number): Promise<{ dosyaAdi: string | null; duzeltmeler: BaslangicDuzeltmesi[] | null } | null> => db.tek(
  `SELECT dosya_adi AS "dosyaAdi", duzeltmeler FROM stok_mal_kabul WHERE id = $1 AND tur = 'baslangic'`, [id]);

// Geri almadan önce: belgenin girdiği eksenler kilitlenir (aynı anda çıkış, taşıma ya da sayım yazılamaz), sonra girişten sonra
// aynı lotta (lotsuz satırda aynı malzeme ve gözde) başka hareket olan satırlar bulunur. Belgenin kendi hareketleri sayılmaz.
export async function baslangicEksenleriniKilitle(db: Db, malKabulId: number): Promise<void> {
  await db.sorgu(
    `SELECT b.id FROM stok_bakiye b JOIN stok_mal_kabul_satiri s ON s.malzeme_id = b.malzeme_id AND s.konum_id = b.konum_id
         AND b.parti_id IS NOT DISTINCT FROM s.parti_id
      WHERE s.mal_kabul_id = $1 ORDER BY b.id FOR UPDATE OF b`, [malKabulId]);
}
export interface HareketGorenSatir {
  lotNo: string | null; konumKod: string | null; tur: HareketTuru; cikisNedeni: CikisNedeni | null; zaman: string;
}
export const hareketGorenSatirlar = (db: Db, malKabulId: number): Promise<HareketGorenSatir[]> => db.sorgu(
  `SELECT p.lot_no AS "lotNo", k.kod AS "konumKod", x.tur, x.cikis_nedeni AS "cikisNedeni", ${zamanMetni('x.zaman')} AS zaman
     FROM stok_mal_kabul_satiri s LEFT JOIN stok_parti p ON p.id = s.parti_id LEFT JOIN stok_konum k ON k.id = s.konum_id
     CROSS JOIN LATERAL (
       SELECT h.tur, h.cikis_nedeni, h.zaman FROM stok_hareketi h WHERE h.id > s.hareket_id AND h.malzeme_id = s.malzeme_id
          AND (CASE WHEN s.parti_id IS NULL THEN h.parti_id IS NULL AND s.konum_id IN (h.kaynak_konum_id, h.hedef_konum_id) ELSE h.parti_id = s.parti_id END)
          AND NOT EXISTS (SELECT 1 FROM stok_mal_kabul_satiri o WHERE o.mal_kabul_id = s.mal_kabul_id AND o.hareket_id = h.id)
        ORDER BY h.id LIMIT 1) x
    WHERE s.mal_kabul_id = $1 AND s.hareket_id IS NOT NULL
    ORDER BY x.zaman, p.lot_no`, [malKabulId]);
export const baslangicSayilari = async (db: Db, malKabulId: number): Promise<{ satir: number; lot: number }> => (await db.tek<{ satir: number; lot: number }>(
  'SELECT count(*)::int AS satir, count(DISTINCT parti_id)::int AS lot FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [malKabulId]))!;
