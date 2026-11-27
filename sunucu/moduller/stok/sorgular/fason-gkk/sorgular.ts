import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// 3809: fason dönüşünün GKK'sı. Dönüş karantinaya "karar bekliyor" girer; hareketler dönüşün açıklamasını taşır ("Fason dönüşü · emir X · OP n",
// dis-akis.ts fasonIsindenDonus). Bakiye anahtarı (kart, konum, parti, statü) başına net giren: bu açıklamalı hareketlerin karantinaya
// karar bekliyor gireni eksi aynı anahtardan karar bekliyor çıkanı (dönüşte yarı parça ürüne çevrilir). Kalite Merkezi'nin kararı
// fason adımının iş emri kimliğini ve FASON_GKK_ACIKLAMASI önekini taşır; bekleyen = net giren - karar, karantinadaki bakiyeyle sınırlı.
export const FASON_DONUSU_ONEKI = 'Fason dönüşü · emir ';
export const FASON_GKK_ACIKLAMASI = 'Fason GKK kararı';

export interface FasonGkkAnahtari {
  uretimEmriId: number; opNo: number; malzemeId: number; konumId: number; partiId: number | null; statuId: number | null;
  giren: string; kararlanan: string; kabullenen: string; bakiye: string; sonZaman: string; malKabulNo: string | null;
}

const ANAHTARLAR = `
  WITH donus AS (
    SELECT h.*, substring(h.aciklama from ' · OP ([0-9]+)')::int AS op_no
      FROM stok_hareketi h
     WHERE h.uretim_emri_id IS NOT NULL AND h.aciklama LIKE '${FASON_DONUSU_ONEKI}%'
       AND ($1::int IS NULL OR h.uretim_emri_id = $1) AND ($2::int IS NULL OR h.aciklama ~ (' · OP ' || $2::text || '( · |$)'))
  ), giren AS (
    SELECT d.uretim_emri_id, d.op_no, d.malzeme_id, d.hedef_konum_id AS konum_id, d.parti_id, d.hedef_statu_id AS statu_id, d.miktar, d.zaman, d.id
      FROM donus d JOIN stok_konum k ON k.id = d.hedef_konum_id
     WHERE k.tur = 'karantina' AND d.hedef_kalite_durumu = 'karar_bekliyor'
    UNION ALL
    SELECT d.uretim_emri_id, d.op_no, d.malzeme_id, d.kaynak_konum_id, d.parti_id, d.kaynak_statu_id, -d.miktar, d.zaman, d.id
      FROM donus d JOIN stok_konum k ON k.id = d.kaynak_konum_id
     WHERE k.tur = 'karantina' AND d.kaynak_kalite_durumu = 'karar_bekliyor'
  ), anahtar AS (
    SELECT uretim_emri_id, op_no, malzeme_id, konum_id, parti_id, statu_id, sum(miktar) AS giren, max(zaman) AS son_zaman, max(id) AS son_id
      FROM giren WHERE op_no IS NOT NULL GROUP BY 1, 2, 3, 4, 5, 6
  )
  SELECT a.uretim_emri_id AS "uretimEmriId", a.op_no AS "opNo", a.malzeme_id AS "malzemeId", a.konum_id AS "konumId", a.parti_id AS "partiId",
         a.statu_id AS "statuId", a.giren::text AS giren,
         COALESCE((SELECT sum(k.miktar) FROM stok_hareketi k
                    WHERE k.uretim_emri_id = a.uretim_emri_id AND k.aciklama LIKE '${FASON_GKK_ACIKLAMASI}%' AND k.aciklama ~ (' · OP ' || a.op_no::text || '( · |$)')
                      AND k.malzeme_id = a.malzeme_id AND k.kaynak_konum_id = a.konum_id AND k.parti_id IS NOT DISTINCT FROM a.parti_id
                      AND k.kaynak_statu_id IS NOT DISTINCT FROM a.statu_id AND k.kaynak_kalite_durumu = 'karar_bekliyor'), 0)::text AS kararlanan,
         COALESCE((SELECT sum(k.miktar) FROM stok_hareketi k
                    WHERE k.uretim_emri_id = a.uretim_emri_id AND k.aciklama LIKE '${FASON_GKK_ACIKLAMASI}%' AND k.aciklama ~ (' · OP ' || a.op_no::text || '( · |$)')
                      AND k.malzeme_id = a.malzeme_id AND k.kaynak_konum_id = a.konum_id AND k.parti_id IS NOT DISTINCT FROM a.parti_id
                      AND k.kaynak_statu_id IS NOT DISTINCT FROM a.statu_id AND k.kaynak_kalite_durumu = 'karar_bekliyor'
                      AND k.hedef_kalite_durumu IN ('serbest', 'sartli')), 0)::text AS kabullenen,
         COALESCE((SELECT sum(b.miktar) FROM stok_bakiye b
                    WHERE b.malzeme_id = a.malzeme_id AND b.konum_id = a.konum_id AND b.parti_id IS NOT DISTINCT FROM a.parti_id
                      AND b.statu_id IS NOT DISTINCT FROM a.statu_id AND b.kalite_durumu = 'karar_bekliyor'), 0)::text AS bakiye,
         ${zamanMetni('a.son_zaman')} AS "sonZaman",
         (SELECT m.no FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id
           JOIN stok_hareketi sh ON sh.id = s.hareket_id
          WHERE sh.uretim_emri_id = a.uretim_emri_id AND sh.aciklama ~ (' · OP ' || a.op_no::text || '( · |$)') AND sh.aciklama LIKE '${FASON_DONUSU_ONEKI}%'
          ORDER BY m.zaman DESC, s.id DESC LIMIT 1) AS "malKabulNo"
    FROM anahtar a
   WHERE a.giren > 0
   ORDER BY a.son_zaman, a.uretim_emri_id, a.op_no, a.malzeme_id, a.konum_id`;

// Emir ve op verilmezse bütün fason dönüşleri; listede yalnız bekleyeni kalanlar okunur (servis süzer).
export const fasonGkkAnahtarlari = (db: Db, uretimEmriId: number | null = null, opNo: number | null = null): Promise<FasonGkkAnahtari[]> =>
  db.sorgu(ANAHTARLAR, [uretimEmriId, opNo]);

// Fason dönüşü GKK'sı yapılan (en az bir kararı olan) emir ve op çiftleri, zaman aralığında; Yapılan sekmesi içindir.
export const fasonGkkKararlari = (db: Db, a: { baslangic: string; bitis: string; sinir: number }): Promise<{
  uretimEmriId: number; opNo: number; hedef: string; miktar: string; kisiId: number; zaman: string;
}[]> => db.sorgu(
  `SELECT k.uretim_emri_id AS "uretimEmriId", substring(k.aciklama from ' · OP ([0-9]+)')::int AS "opNo", k.hedef_kalite_durumu AS hedef, k.miktar::text AS miktar,
          k.kisi_id AS "kisiId", ${zamanMetni('k.zaman')} AS zaman
     FROM stok_hareketi k
    WHERE k.aciklama LIKE '${FASON_GKK_ACIKLAMASI}%' AND k.kaynak_kalite_durumu = 'karar_bekliyor' AND k.uretim_emri_id IS NOT NULL
      AND k.zaman::date BETWEEN $1::date AND $2::date
    ORDER BY k.zaman DESC, k.id DESC LIMIT $3`,
  [a.baslangic, a.bitis, a.sinir],
);
