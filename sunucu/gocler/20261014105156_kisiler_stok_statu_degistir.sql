-- Statüyü yalnız üretim değiştirir (kullanıcı kararı 14.10.2026, kart #1208): statü değiştirme stok transferinden ayrı bir
-- işlemdir ve depoya verilmez. Bugün bu ucu kullanan müdür (Reçete ve Rota "Statü atlat") yetkisini korur.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'stok.statu-degistir';
  RAISE NOTICE 'rol_islemi: % stok.statu-degistir satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'stok.statu-degistir')
  ) AS m (kod, islem);
