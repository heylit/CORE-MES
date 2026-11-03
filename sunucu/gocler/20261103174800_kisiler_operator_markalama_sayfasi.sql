-- 2048 b + teyit: operatör terminaldeki markalama panelinin okumaları için Markalama sayfasını alır (sayfa.markalama; tanım ve seri
-- okuması). Yazma yalnız markalama.seri-ver ile kalır; tanım ve durum yazma verilmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod = 'operator' AND ri.islem = 'sayfa.markalama';
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'operator'), 'sayfa.markalama'
ON CONFLICT DO NOTHING;
