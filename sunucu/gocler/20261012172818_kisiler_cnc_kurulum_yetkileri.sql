-- CNC Kurulum Motoru rollere açılır (kullanıcı kararı, 12.10.2026): kurulumu hazırlayanlar (müdür, planlama, CAM)
-- görür ve yazar; kalite ve bakım görür. Operatöre verilmez: operatör yalnız terminal ve kuyruğu görür (kart #713).

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem IN ('sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz');
  RAISE NOTICE 'rol_islemi: % CNC kurulum satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.cnc-kurulum'),
    ('mudur', 'cnc-kurulum.oku'),
    ('mudur', 'cnc-kurulum.yaz'),
    ('planlama_proje', 'sayfa.cnc-kurulum'),
    ('planlama_proje', 'cnc-kurulum.oku'),
    ('planlama_proje', 'cnc-kurulum.yaz'),
    ('cam', 'sayfa.cnc-kurulum'),
    ('cam', 'cnc-kurulum.oku'),
    ('cam', 'cnc-kurulum.yaz'),
    ('kalite', 'sayfa.cnc-kurulum'),
    ('kalite', 'cnc-kurulum.oku'),
    ('bakim', 'sayfa.cnc-kurulum'),
    ('bakim', 'cnc-kurulum.oku')
  ) AS m (kod, islem);
