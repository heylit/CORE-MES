-- 2030 a + teyit: operatör markalama istasyonunda seriyi sunucudan alır ve okutarak doğrular (markalama.seri-ver; durum ve tanım yazmaz).
-- 2034 a + teyit: depo, depo istasyonunun terminalinden mal kabul yapar (sayfa.uretim-terminali; stok.giris zaten depoda).

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE (r.kod, ri.islem) IN (('operator', 'markalama.seri-ver'), ('depo', 'sayfa.uretim-terminali'));
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('operator', 'markalama.seri-ver'), ('depo', 'sayfa.uretim-terminali')) AS m (kod, islem)
ON CONFLICT DO NOTHING;
