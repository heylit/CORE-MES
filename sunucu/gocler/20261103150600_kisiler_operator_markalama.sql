-- 2030 a + teyit: operatör markalama istasyonunda seriyi sunucudan alır ve okutarak doğrular (markalama.seri-ver; durum ve tanım yazmaz).
-- Depo rolüne terminal sayfası burada verilmez (2039 a): terminal Arkon rolü ister; depo erişimi Arkon rolü istemeyen mal kabul görünümüyle gelir.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod = 'operator' AND ri.islem = 'markalama.seri-ver';
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'operator'), 'markalama.seri-ver'
ON CONFLICT DO NOTHING;
