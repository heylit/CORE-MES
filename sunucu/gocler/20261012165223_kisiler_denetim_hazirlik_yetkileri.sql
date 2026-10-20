-- Denetim Hazırlığı rollere açılır (kart #742, kullanıcı kararı 12.10.2026 "rol göçleri girer"; dağılım teslimin ON-PAKET önerisi):
-- müdür ve kalite görür, okur, yazar; planlama görür ve okur. Kurulum işlemi (`.yonet`) hiçbir role verilmez, yalnız bayraklı yöneticide kalır.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'sayfa.denetim-hazirlik' OR islem LIKE 'denetim-hazirlik.%';
  RAISE NOTICE 'rol_islemi: % denetim hazırlığı satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.denetim-hazirlik'),
    ('mudur', 'denetim-hazirlik.oku'),
    ('mudur', 'denetim-hazirlik.yaz'),
    ('kalite', 'sayfa.denetim-hazirlik'),
    ('kalite', 'denetim-hazirlik.oku'),
    ('kalite', 'denetim-hazirlik.yaz'),
    ('planlama_proje', 'sayfa.denetim-hazirlik'),
    ('planlama_proje', 'denetim-hazirlik.oku')
  ) AS m (kod, islem);
