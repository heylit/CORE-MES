-- Aynı firmanın aynı yöndeki belge numarası bir kez girilir (243 a); iptal edilen belge sayılmaz, numarası yeniden kullanılabilir.
-- Dolu tabloda kısıt kurulmadan önce mükerrer aranır: varsa göç durur ve çakışan belge kimliklerini verir. Hangisinin
-- iptal edileceği kullanıcının kararıdır; göç veri silmez ve değiştirmez.
DO $$
DECLARE
  liste text;
  grup int;
BEGIN
  SELECT count(*)::int, string_agg(format('firma %s, %s: belge %s', firma_id, yon, kimlikler), '; ' ORDER BY firma_id, yon)
    INTO grup, liste
    FROM (SELECT firma_id, yon, string_agg(id::text, ', ' ORDER BY id) AS kimlikler
            FROM finans_belge
           WHERE durum <> 'iptal' AND firma_id IS NOT NULL AND belge_no IS NOT NULL
           GROUP BY firma_id, yon, belge_no
          HAVING count(*) > 1) m;
  IF grup > 0 THEN
    RAISE EXCEPTION 'finans_belge: % mükerrer belge no grubu var, tekillik kurulmadı. Fazlalar iptal edildikten sonra göç yeniden koşar. %', grup, liste;
  END IF;
END $$;

CREATE UNIQUE INDEX finans_belge_no_tekil ON finans_belge (firma_id, yon, belge_no) WHERE durum <> 'iptal';
