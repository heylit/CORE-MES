-- 2034 a + teyit, 2039 a: depo, depo istasyonunun terminalinden mal kabul yapar (sayfa.uretim-terminali; stok.giris zaten depoda).
-- Arkon rolü verilmez: terminal Arkon rolü olmayan kişiye yalnız mal kabulü açar.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod = 'depo' AND ri.islem = 'sayfa.uretim-terminali';
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'depo'), 'sayfa.uretim-terminali'
ON CONFLICT DO NOTHING;
