import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import { KULLANILABILIR_SQL } from '../ortak/sorgular.ts';

// ---- Takımhane (kart 3613): kişi konumu, takımın konuma göre dağılımı, iade durumu ----------------------------------------------
// Kişi konumu kişiden kendiliğinden açılır (zimmet); kişi başına tek, eşzamanlı ikinci açılış satır döndürmez, çağıran okur.
export const kisiKonumuAc = async (db: Db, k: { depoId: number; kod: string; ad: string; kisiId: number }): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `INSERT INTO stok_konum (depo_id, kod, tur, ad, kisi_id) VALUES ($1, $2, 'kisi', $3, $4)
     ON CONFLICT ON CONSTRAINT stok_konum_kisi_tek DO NOTHING RETURNING id`, [k.depoId, k.kod, k.ad, k.kisiId]))?.id ?? null;
export const kisiKonumu = async (db: Db, kisiId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kisi_id = $1', [kisiId]))?.id ?? null;
export const konumKisisi = async (db: Db, konumId: number): Promise<number | null> =>
  (await db.tek<{ kisiId: number | null }>('SELECT kisi_id AS "kisiId" FROM stok_konum WHERE id = $1', [konumId]))?.kisiId ?? null;

export interface KonumTurToplami { malzemeId: number; tur: string; miktar: string }
// Takımın hangi türde konumda kaç adet durduğu (bütün kalite durumları; eksi bakiye sayılmaz).
export const malzemeKonumTurToplamlari = (db: Db, malzemeIdler: readonly number[]): Promise<KonumTurToplami[]> =>
  malzemeIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    `SELECT b.malzeme_id AS "malzemeId", k.tur, sum(b.miktar)::text AS miktar
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.malzeme_id = ANY($1::int[]) AND b.miktar > 0 GROUP BY b.malzeme_id, k.tur`, [[...malzemeIdler]]);

export interface AlandakiTakim { malzemeId: number; konumId: number; konumTur: string; konumAd: string | null; kisiId: number | null; istasyonId: number | null; miktar: string; gelis: string | null }
// Kişide ve istasyonda duran takım bakiyesi (teslimdekiler).
export const alandakiTakimlar = (db: Db, malzemeIdler: readonly number[]): Promise<AlandakiTakim[]> =>
  malzemeIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    `SELECT b.malzeme_id AS "malzemeId", k.id AS "konumId", k.tur AS "konumTur", k.ad AS "konumAd", k.kisi_id AS "kisiId", k.istasyon_id AS "istasyonId",
            sum(b.miktar)::text AS miktar, ${zamanMetni('max(b.konuma_gelis)')} AS gelis
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.malzeme_id = ANY($1::int[]) AND k.tur IN ('kisi', 'istasyon') AND b.miktar > 0
      GROUP BY b.malzeme_id, k.id, k.tur, k.ad, k.kisi_id, k.istasyon_id ORDER BY max(b.konuma_gelis) DESC`, [[...malzemeIdler]]);

// Takımın raftaki yeri: en çok kullanılabilir adedin durduğu raf gözü; hiç yoksa kartın varsayılan konumu; o da yoksa takımın en son
// raftan çıktığı göz (bütün adet dışarıdayken iade geldiğinde geldiği yere döner).
export const malzemeRafKonumu = async (db: Db, malzemeId: number): Promise<number | null> =>
  (await db.tek<{ id: number }>(
    `SELECT k.id FROM stok_konum k LEFT JOIN stok_bakiye b ON b.konum_id = k.id AND b.malzeme_id = $1 AND b.${KULLANILABILIR_SQL}
      WHERE k.aktif AND k.tur = 'raf_gozu' AND (b.malzeme_id IS NOT NULL OR k.id = (SELECT varsayilan_konum_id FROM stok_malzeme_ayari WHERE malzeme_id = $1))
      ORDER BY coalesce(b.miktar, 0) DESC, k.kod LIMIT 1`, [malzemeId]))?.id
  ?? (await db.tek<{ id: number }>(
    `SELECT k.id FROM stok_teslim t JOIN stok_konum k ON k.id = t.kaynak_konum_id
      WHERE t.malzeme_id = $1 AND k.aktif AND k.tur = 'raf_gozu' ORDER BY t.id DESC LIMIT 1`, [malzemeId]))?.id ?? null;
export const ilkAktifKonum = async (db: Db, tur: string): Promise<number | null> =>
  (await db.tek<{ id: number }>('SELECT id FROM stok_konum WHERE aktif AND tur = $1 ORDER BY kod, id LIMIT 1', [tur]))?.id ?? null;
// CNC takım değişiminde önce düşülecek: o istasyonun konumundaki serbest bakiye.
export const istasyonBakiyeleri = (db: Db, malzemeId: number, istasyonId: number): Promise<{ konumId: number; partiId: number | null; miktar: string }[]> =>
  db.sorgu(
    `SELECT b.konum_id AS "konumId", b.parti_id AS "partiId", b.miktar::text AS miktar
       FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.malzeme_id = $1 AND k.tur = 'istasyon' AND k.istasyon_id = $2 AND b.miktar > 0 AND b.${KULLANILABILIR_SQL}
      ORDER BY b.ilk_giris, b.id`, [malzemeId, istasyonId]);
export const teslimIadeDurumuYaz = (db: Db, teslimId: number, durum: string, neden: string | null): Promise<unknown[]> =>
  db.sorgu('UPDATE stok_teslim SET iade_durumu = $2, iade_nedeni = $3 WHERE id = $1 RETURNING id', [teslimId, durum, neden]);
// Takım kartının sipariş noktası ve en çok girişin yapıldığı rafın kodu (liste satırı).
export const takimEsikleri = (db: Db, malzemeIdler: readonly number[]): Promise<{ malzemeId: number; kritikSeviye: string | null; rafKodu: string | null }[]> =>
  malzemeIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    `SELECT m.id AS "malzemeId", a.kritik_seviye::text AS "kritikSeviye",
            (SELECT k.kod FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
              WHERE b.malzeme_id = m.id AND k.tur = 'raf_gozu' AND b.miktar > 0 ORDER BY b.miktar DESC, k.kod LIMIT 1) AS "rafKodu"
       FROM unnest($1::int[]) AS m (id) LEFT JOIN stok_malzeme_ayari a ON a.malzeme_id = m.id`, [[...malzemeIdler]]);

// Aparat (kart 3651): emir ve konum başına tezgâha ya da kişiye çıkmış, henüz dönmemiş adet. Çıkış teslim kaydıdır (alan aldığında bakiye
// taşınır); aynı emirden kişi ya da tezgâhtan dönen iade düşer. `yolda`: alan henüz almadığı çıkış (bakiye hâlâ rafta).
export interface EmirAparatCikisi { emirId: number | null; malzemeId: number; konumId: number; konumTur: string; konumAd: string | null; disarida: string; yolda: string; sonCikis: string | null }
export const emirAparatCikislari = (db: Db, malzemeIdler: readonly number[]): Promise<EmirAparatCikisi[]> =>
  malzemeIdler.length === 0 ? Promise.resolve([]) : db.sorgu(
    `WITH hareket AS (
       SELECT t.uretim_emri_id AS emir, t.malzeme_id AS malzeme, hk.id AS konum, hk.tur AS tur, hk.ad AS ad,
              CASE WHEN t.durum = 'teslim' THEN t.alinan ELSE 0 END AS giden, CASE WHEN t.durum = 'yolda' THEN t.miktar ELSE 0 END AS yolda, t.gonderim AS gonderim
         FROM stok_teslim t JOIN stok_konum hk ON hk.id = t.hedef_konum_id
        WHERE t.malzeme_id = ANY($1::int[]) AND hk.tur IN ('kisi', 'istasyon') AND t.durum IN ('teslim', 'yolda')
       UNION ALL
       SELECT t.uretim_emri_id, t.malzeme_id, kk.id, kk.tur, kk.ad, -t.alinan, 0, NULL::timestamptz
         FROM stok_teslim t JOIN stok_konum kk ON kk.id = t.kaynak_konum_id
        WHERE t.malzeme_id = ANY($1::int[]) AND kk.tur IN ('kisi', 'istasyon') AND t.durum = 'teslim')
     SELECT emir AS "emirId", malzeme AS "malzemeId", konum AS "konumId", tur AS "konumTur", max(ad) AS "konumAd",
            sum(giden)::text AS disarida, sum(yolda)::text AS yolda,
            ${zamanMetni('max(gonderim)')} AS "sonCikis"
       FROM hareket GROUP BY emir, malzeme, konum, tur HAVING sum(giden) <> 0 OR sum(yolda) <> 0`, [[...malzemeIdler]]);

// Kişide ya da tezgâhta bakiyesi duran her malzeme: kartı kümeden düşmüş (emir kapanmış, kapasite satırı silinmiş) aparatın iadesi yine alınabilir.
export const konumlardakiMalzemeler = async (db: Db): Promise<number[]> =>
  (await db.sorgu<{ id: number }>(
    `SELECT DISTINCT b.malzeme_id AS id FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE k.tur IN ('kisi', 'istasyon') AND b.miktar > 0`)).map((r) => r.id);
