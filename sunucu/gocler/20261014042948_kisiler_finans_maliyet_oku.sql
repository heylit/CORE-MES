-- Birim maliyetlerini görme işlemi rollere verilir (kullanıcı kararı 14.10.2026, kart #1187): muhasebe, müdür ve planlama görür; yazma finans.yonet'te kalır.
-- Kalite ve CAM maliyet görmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'finans.maliyet-oku';
  RAISE NOTICE 'rol_islemi: % finans.maliyet-oku satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('muhasebe_finans', 'finans.maliyet-oku'),
    ('mudur', 'finans.maliyet-oku'),
    ('planlama_proje', 'finans.maliyet-oku')
  ) AS m (kod, islem);
