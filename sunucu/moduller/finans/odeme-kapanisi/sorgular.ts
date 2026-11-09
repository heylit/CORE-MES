import type { Db } from '#cekirdek/db.ts';

export interface KapanisSatiri { talepId: string; teklifId: string; belgeSayisi: number; acikSayisi: number; sonGun: string | null }

// 2481-1 a: kapanış günü paranın çıktığı gündür; ödeme kaydının günü değil. Çek, senet ve ciroda para çekin vadesinde çıkar,
// öteki yöntemlerde ödemenin tarihinde (dağılımın tarihi değil: sonradan dağıtılan avans erken ödenmiştir).
// 2481-2 a: mahsup da belgeyi kapatır; günü mahsubun tarihidir. İptal edilmiş dağılım, ödeme ve mahsup sayılmaz.
// Siparişe bağlı her belge (iptal edilmemiş) bir satır; durum tetikleyicinin yazdığı kapandi/acik alanıdır.
export function siparisKapanislari(db: Db, talepIdler: readonly string[], teklifIdler: readonly string[]): Promise<KapanisSatiri[]> {
  return db.sorgu<KapanisSatiri>(
    `WITH b AS (
       SELECT b.id, b.satin_alma_talep_id AS talep_id, b.satin_alma_teklif_id AS teklif_id, b.durum
         FROM finans_belge b
         JOIN unnest($1::uuid[], $2::uuid[]) AS a(talep_id, teklif_id) ON a.talep_id = b.satin_alma_talep_id AND a.teklif_id = b.satin_alma_teklif_id
        WHERE b.durum <> 'iptal'),
     k AS (
       SELECT d.belge_id, CASE WHEN o.yontem IN ('cek', 'senet', 'ciro') THEN c.vade ELSE o.tarih END AS gun
         FROM finans_odeme_dagilimi d
         JOIN finans_odeme o ON o.id = d.odeme_id
         LEFT JOIN finans_cek c ON c.id = o.cek_id
        WHERE d.belge_id IN (SELECT id FROM b) AND d.iptal_zamani IS NULL AND o.iptal_zamani IS NULL
       UNION ALL
       SELECT m.alis_belge_id, m.tarih FROM finans_mahsup m WHERE m.alis_belge_id IN (SELECT id FROM b) AND m.iptal_zamani IS NULL
       UNION ALL
       SELECT m.satis_belge_id, m.tarih FROM finans_mahsup m WHERE m.satis_belge_id IN (SELECT id FROM b) AND m.iptal_zamani IS NULL)
     SELECT b.talep_id AS "talepId", b.teklif_id AS "teklifId", count(DISTINCT b.id)::int AS "belgeSayisi",
            (count(DISTINCT b.id) FILTER (WHERE b.durum <> 'kapandi'))::int AS "acikSayisi", max(k.gun) AS "sonGun"
       FROM b LEFT JOIN k ON k.belge_id = b.id
      GROUP BY b.talep_id, b.teklif_id`,
    [[...talepIdler], [...teklifIdler]],
  );
}
