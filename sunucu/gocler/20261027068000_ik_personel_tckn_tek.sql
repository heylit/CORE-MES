-- 835: T.C. kimlik no iptal edilmemiş personelde tekil (sicil no ile aynı kalıp); ekran denetimi yarışta ve toplu aktarımda korumaz.
-- Tekrar sayısı her koşuda bildirilir; tekrar varsa göç durur. Değerler yazılmaz, yalnız sayı. Satır değişmez.
DO $$
DECLARE
  tekrar bigint;
BEGIN
  SELECT count(*) INTO tekrar FROM (
    SELECT tckn FROM ik_personel WHERE tckn IS NOT NULL AND NOT iptal GROUP BY tckn HAVING count(*) > 1
  ) t;
  RAISE NOTICE 'ik_personel: % T.C. kimlik no birden çok personelde kayıtlı', tekrar;
  IF tekrar > 0 THEN
    RAISE EXCEPTION 'ik_personel: % T.C. kimlik no birden çok personelde kayıtlı; kayıtlar düzeltilmeden tekillik eklenmez', tekrar;
  END IF;
END $$;

CREATE UNIQUE INDEX ik_personel_tckn_tek ON ik_personel (tckn) WHERE tckn IS NOT NULL AND NOT iptal;
