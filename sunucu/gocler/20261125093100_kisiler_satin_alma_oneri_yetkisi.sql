-- 3696: "oneriyle geri gonder" yetkisi, satin-alma.onayla taşıyan her role verilir (onaylayanlar). Yalnız ekleme.
DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'satin-alma.oneri-gonder';
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

INSERT INTO rol_islemi (rol_id, islem)
SELECT ri.rol_id, 'satin-alma.oneri-gonder'
  FROM rol_islemi ri
 WHERE ri.islem = 'satin-alma.onayla'
ON CONFLICT DO NOTHING;
