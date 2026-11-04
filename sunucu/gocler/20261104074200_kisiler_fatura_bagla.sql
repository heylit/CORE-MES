-- 2077-3 a (modul-test K8 a): fatura-siparis bagi dar islemle. Muhasebe bagi kurar, satin alma kaydi yazmaz;
-- satin almada satin-alma.yaz bagi zaten kurar, islem matriste acik gorunsun diye ona da verilir. Yalniz ekleme.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod IN ('satin_alma', 'muhasebe_finans') AND ri.islem = 'satin-alma.fatura-bagla';
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'satin-alma.fatura-bagla'
  FROM rol r
 WHERE r.kod IN ('satin_alma', 'muhasebe_finans')
ON CONFLICT DO NOTHING;
