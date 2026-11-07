import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { DEFTER_FARKI_SECIMI } from '../ortak/sorgular.ts';

// ---- Kör sayım ve sayım farkı onayı (1279 a, 1691 teyit) ------------------------------------------------------------------
export const konumunSayimEsigi = async (db: Db, konumId: number): Promise<string> => (await db.tek<{ esik: string }>(
  'SELECT d.sayim_esik_yuzde::text AS esik FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id WHERE k.id = $1', [konumId]))?.esik ?? '0';
export interface SayimFarkiYeni { konumId: number; malzemeId: number; partiId: number | null; sistemMiktar: string; sayilanMiktar: string; sayanKisiId: number }
// Aynı gözde bekleyen fark varsa yazılmaz (null döner): ikinci sayım ilk farkın kararını bekler.
export const sayimFarkiEkle = async (db: Db, f: SayimFarkiYeni): Promise<number | null> => (await db.tek<{ id: number }>(
  `INSERT INTO stok_sayim_farki (konum_id, malzeme_id, parti_id, sistem_miktar, sayilan_miktar, sayan_kisi_id) VALUES ($1, $2, $3, $4, $5, $6)
   ON CONFLICT (konum_id, malzeme_id, (COALESCE(parti_id, 0))) WHERE durum = 'bekliyor' DO NOTHING RETURNING id`,
  [f.konumId, f.malzemeId, f.partiId, f.sistemMiktar, f.sayilanMiktar, f.sayanKisiId]))?.id ?? null;
export interface SayimFarkiHam {
  id: number; konumId: number; konumKod: string; depoId: number; malzemeId: number; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null;
  dokumNo: string | null; partiEmirId: number | null; sistemMiktar: string; sayilanMiktar: string; guncelMiktar: string; sayanKisiId: number; sayimZamani: string;
  durum: 'bekliyor' | 'onaylandi' | 'reddedildi'; kararKisiId: number | null; kararZamani: string | null; kararNotu: string | null; hareketId: number | null; surum: number;
}
// Güncel miktar sayımın eksenindedir (statüsüz, serbest): sayım yalnız o bakiyeyi sayar.
const SAYIM_FARKI_SECIMI = `SELECT f.id, f.konum_id AS "konumId", k.kod AS "konumKod", k.depo_id AS "depoId", f.malzeme_id AS "malzemeId", f.parti_id AS "partiId",
  p.lot_no AS "lotNo", p.tedarikci_parti_no AS "tedarikciPartiNo", p.dokum_no AS "dokumNo", p.uretim_emri_id AS "partiEmirId",
  f.sistem_miktar::text AS "sistemMiktar", f.sayilan_miktar::text AS "sayilanMiktar",
  COALESCE((SELECT b.miktar FROM stok_bakiye b WHERE b.malzeme_id = f.malzeme_id AND b.konum_id = f.konum_id AND b.parti_id IS NOT DISTINCT FROM f.parti_id
    AND b.statu_id IS NULL AND b.kalite_durumu = 'serbest'), 0)::text AS "guncelMiktar",
  f.sayan_kisi_id AS "sayanKisiId", ${zamanMetni('f.sayim_zamani')} AS "sayimZamani", f.durum, f.karar_kisi_id AS "kararKisiId",
  ${zamanMetni('f.karar_zamani')} AS "kararZamani", f.karar_notu AS "kararNotu", f.hareket_id AS "hareketId", f.surum
  FROM stok_sayim_farki f JOIN stok_konum k ON k.id = f.konum_id LEFT JOIN stok_parti p ON p.id = f.parti_id`;
// Bekleyenlerin hepsi ve karara bağlanan son 50 fark.
export const sayimFarklari = (db: Db): Promise<SayimFarkiHam[]> => db.sorgu(
  `(${SAYIM_FARKI_SECIMI} WHERE f.durum = 'bekliyor' ORDER BY f.id)
   UNION ALL (${SAYIM_FARKI_SECIMI} WHERE f.durum <> 'bekliyor' ORDER BY f.karar_zamani DESC, f.id DESC LIMIT 50)`);
export const sayimFarkiBul = (db: Db, id: number, kilit = false): Promise<SayimFarkiHam | null> =>
  db.tek(`${SAYIM_FARKI_SECIMI} WHERE f.id = $1${kilit ? ' FOR UPDATE OF f' : ''}`, [id]);
export const sayimFarkiVarMi = async (db: Db, id: number): Promise<boolean> => (await db.tek('SELECT 1 FROM stok_sayim_farki WHERE id = $1', [id])) !== null;
export const bekleyenSayimFarkiSayisi = async (db: Db): Promise<number> =>
  Number((await db.tek<{ n: string }>("SELECT count(*)::text AS n FROM stok_sayim_farki WHERE durum = 'bekliyor'"))?.n ?? 0);
export const sayimFarkiKarar = (db: Db, id: number, surum: number, k: { durum: 'onaylandi' | 'reddedildi'; kisiId: number; not: string | null; hareketId: number | null }): Promise<{ id: number } | null> =>
  db.tek(`UPDATE stok_sayim_farki SET durum = $3, karar_kisi_id = $4, karar_zamani = now(), karar_notu = $5, hareket_id = $6, surum = surum + 1
          WHERE id = $1 AND surum = $2 AND durum = 'bekliyor' RETURNING id`, [id, surum, k.durum, k.kisiId, k.not, k.hareketId]);
export const sayimEsikleri = (db: Db): Promise<{ depoId: number; depoKod: string; depoAd: string; esikYuzde: string; surum: number }[]> =>
  db.sorgu('SELECT id AS "depoId", kod AS "depoKod", ad AS "depoAd", sayim_esik_yuzde::text AS "esikYuzde", surum FROM stok_depo WHERE aktif ORDER BY kod, id');
export const sayimEsigiYaz = (db: Db, depoId: number, surum: number, esikYuzde: string): Promise<{ id: number } | null> =>
  db.tek('UPDATE stok_depo SET sayim_esik_yuzde = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 AND aktif RETURNING id', [depoId, surum, esikYuzde]);

// Değişiklik etkisi (1647): malzemenin pozitif bakiyesi parti başına (partisiz bakiye parti kimliği boş tek satır), partinin revizyonuyla.
export interface PartiBakiyesi { malzemeId: number; partiId: number | null; lotNo: string | null; parcaRevizyonu: string | null; miktar: string }
export const malzemePartiBakiyeleri = (db: Db, malzemeIdler: readonly number[]): Promise<PartiBakiyesi[]> => db.sorgu(
  `SELECT b.malzeme_id AS "malzemeId", b.parti_id AS "partiId", p.lot_no AS "lotNo", p.parca_revizyonu AS "parcaRevizyonu", sum(b.miktar)::text AS miktar
     FROM stok_bakiye b LEFT JOIN stok_parti p ON p.id = b.parti_id
    WHERE b.malzeme_id = ANY($1::int[])
    GROUP BY b.malzeme_id, b.parti_id, p.lot_no, p.parca_revizyonu
   HAVING sum(b.miktar) > 0
    ORDER BY b.malzeme_id, b.parti_id NULLS FIRST`, [[...malzemeIdler]]);

// ---- Gece defter karşılaştırması (1692 a) ----------------------------------------------------------------------------------
// Son karşılaştırmanın zamanı; hiç yapılmadıysa null.
export const sonDefterKarsilastirmasi = (db: Db): Promise<{ id: number; zaman: string; farkSayisi: number } | null> =>
  db.tek(`SELECT id, ${zamanMetni('zaman')} AS zaman, fark_sayisi AS "farkSayisi" FROM stok_defter_karsilastirma ORDER BY zaman DESC, id DESC LIMIT 1`);
// Bugün (İstanbul günü) karşılaştırma yapıldı mı ve yerel saat eşiği geçti mi: iş saatte bir koşar, gece bir kez karşılaştırır.
export const defterKarsilastirmaZamaniMi = async (db: Db, saat: number): Promise<boolean> => (await db.tek<{ zamani: boolean }>(
  `SELECT extract(hour FROM now() AT TIME ZONE 'Europe/Istanbul') >= $1
      AND NOT EXISTS (SELECT 1 FROM stok_defter_karsilastirma WHERE (zaman AT TIME ZONE 'Europe/Istanbul')::date = (now() AT TIME ZONE 'Europe/Istanbul')::date) AS zamani`,
  [saat]))?.zamani ?? false;
// Karşılaştırmayı tek ifadede yazar: tur satırı ve farkları aynı anlık görüntüden.
export const defterKarsilastir = async (db: Db): Promise<{ id: number; farkSayisi: number }> => (await db.tek<{ id: number; farkSayisi: number }>(
  `WITH f AS (${DEFTER_FARKI_SECIMI}),
        k AS (INSERT INTO stok_defter_karsilastirma (fark_sayisi) SELECT count(*) FROM f RETURNING id, fark_sayisi),
        y AS (INSERT INTO stok_defter_farki (karsilastirma_id, malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, bakiye, defter)
              SELECT k.id, f.malzeme_id, f.konum_id, f.parti_id, f.statu_id, f.kalite_durumu, f.bakiye, f.defter FROM f, k)
   SELECT id, fark_sayisi AS "farkSayisi" FROM k`))!;
export interface DefterFarkiHam {
  malzemeId: number; malzemeAd: string | null; konumId: number; konumKod: string | null; partiId: number | null; lotNo: string | null;
  statuId: number | null; kaliteDurumu: string; bakiye: string; defter: string;
}
export const defterFarklari = (db: Db, karsilastirmaId: number): Promise<DefterFarkiHam[]> => db.sorgu(
  `SELECT f.malzeme_id AS "malzemeId", m.kayit #>> '{com,ad}' AS "malzemeAd", f.konum_id AS "konumId", k.kod AS "konumKod", f.parti_id AS "partiId",
     p.lot_no AS "lotNo", f.statu_id AS "statuId", f.kalite_durumu AS "kaliteDurumu", f.bakiye::text AS bakiye, f.defter::text AS defter
   FROM stok_defter_farki f LEFT JOIN malzeme_katalog_karti m ON m.no = f.malzeme_id LEFT JOIN stok_konum k ON k.id = f.konum_id
     LEFT JOIN stok_parti p ON p.id = f.parti_id
   WHERE f.karsilastirma_id = $1 ORDER BY k.kod NULLS LAST, f.malzeme_id, f.parti_id NULLS FIRST`, [karsilastirmaId]);
