-- Fason gidiş, dönüş ve tamamlama ayrı işlemdir (kart #262, kullanıcı kararı 2026-10-09): parçayı dış atölyeye depo gönderip teslim alır;
-- emri açan roller de kaydedebilir. Depo emir sayfasını almaz; adımlı emri bu işlemle okur.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'uretim-emirleri.fason';
  RAISE NOTICE 'rol_islemi: % fason satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('depo', 'uretim-emirleri.fason'),
    ('mudur', 'uretim-emirleri.fason'),
    ('planlama_proje', 'uretim-emirleri.fason')
  ) AS m (kod, islem);
