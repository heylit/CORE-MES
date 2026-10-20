-- Stok işlemleri rollere verilir (kart #223, kullanıcı kararı RC1 R4-R6, R13): depo malı alır, çıkarır, taşır, sayar ve toplar;
-- müdür ek olarak geri alır ve raf/konum tanımlar; planlama yalnız toplar; bakım stoğu yalnız okur, çıkış yapmaz (malzemeyi depo çıkarır).

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem LIKE 'stok.%' OR islem = 'sayfa.stok';
  RAISE NOTICE 'rol_islemi: % stok satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('depo', 'stok.giris'),
    ('depo', 'stok.cikis'),
    ('depo', 'stok.transfer'),
    ('depo', 'stok.sayim'),
    ('depo', 'stok.toplama'),
    ('planlama_proje', 'stok.toplama'),
    ('mudur', 'stok.giris'),
    ('mudur', 'stok.cikis'),
    ('mudur', 'stok.transfer'),
    ('mudur', 'stok.sayim'),
    ('mudur', 'stok.tanim'),
    ('mudur', 'stok.geri-al'),
    ('mudur', 'stok.toplama'),
    ('bakim', 'sayfa.stok')
  ) AS m (kod, islem);
