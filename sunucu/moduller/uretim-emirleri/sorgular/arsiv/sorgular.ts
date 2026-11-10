import type { Db } from '#cekirdek/db.ts';

// 2721 arşiv önizlemesi: adım başına fasonda kalan (giden - dönen - dönüşte hurda).
export function fasondaKalanlar(db: Db, emirId: number): Promise<{ isEmriId: number; opNo: number; adet: number }[]> {
  return db.sorgu(
    `SELECT i.id AS "isEmriId", i.op_no AS "opNo",
            (COALESCE(sum(h.adet) FILTER (WHERE h.yon = 'gidis'), 0) - COALESCE(sum(h.adet) FILTER (WHERE h.yon = 'donus'), 0)
              - COALESCE(sum(h.hurda_adet) FILTER (WHERE h.yon = 'donus'), 0))::int AS adet
       FROM uretim_emirleri_is_emri i JOIN uretim_emirleri_fason_hareketi h ON h.is_emri_id = i.id
      WHERE i.uretim_emri_id = $1
      GROUP BY i.id, i.op_no
     HAVING (COALESCE(sum(h.adet) FILTER (WHERE h.yon = 'gidis'), 0) - COALESCE(sum(h.adet) FILTER (WHERE h.yon = 'donus'), 0)
              - COALESCE(sum(h.hurda_adet) FILTER (WHERE h.yon = 'donus'), 0)) > 0
      ORDER BY i.op_no`,
    [emirId],
  );
}

// Açık makine kullanımı ve katılımı olan adımlar, açık katılımın kişileriyle (çalışan iş).
export function acikCalismalar(db: Db, emirId: number): Promise<{ isEmriId: number | null; istasyonId: number; kisiIdleri: number[] }[]> {
  return db.sorgu(
    `SELECT t.is_emri_id AS "isEmriId", min(t.istasyon_id)::int AS "istasyonId", COALESCE(array_agg(DISTINCT t.kisi_id) FILTER (WHERE t.kisi_id IS NOT NULL), '{}') AS "kisiIdleri"
       FROM (SELECT k.is_emri_id, k.istasyon_id, NULL::int AS kisi_id FROM uretim_emirleri_makine_kullanimi k WHERE k.emir_id = $1 AND k.bitis IS NULL
             UNION ALL
             SELECT c.is_emri_id, c.istasyon_id, c.kisi_id FROM uretim_emirleri_katilim c WHERE c.emir_id = $1 AND c.cikis IS NULL) t
      GROUP BY t.is_emri_id ORDER BY t.is_emri_id NULLS FIRST`,
    [emirId],
  );
}

// Emrin en ileri sayılmış adımındaki sağlam (karar verilmiş; karar bekleyen ayrı sayılır). Hiç sağlam sayımı yoksa null.
export async function enIleriSaglam(db: Db, emirId: number): Promise<{ opNo: number; adet: number } | null> {
  return db.tek<{ opNo: number; adet: number }>(
    `SELECT i.op_no AS "opNo", sum(s.adet)::int AS adet
       FROM uretim_sayimi s JOIN uretim_emirleri_is_emri i ON i.id = s.is_emri_id
      WHERE s.emir_id = $1 AND s.tur = 'saglam'
      GROUP BY i.id, i.sira, i.op_no ORDER BY i.sira DESC LIMIT 1`,
    [emirId],
  );
}
