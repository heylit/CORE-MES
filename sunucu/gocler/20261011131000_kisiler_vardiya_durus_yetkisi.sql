-- Planlı duruşu Vardiya'da ve Arkon formundan müdür ile planlama yazar (kart #519, kullanıcı kararı 2026-10-11: "yeni yetki; müdür,
-- planlama ve kendi iş merkezi için amir"). Arkon amiri müdür rolündedir; iş merkezi sınırı kişinin veri kapsamından gelir.
-- Yalnız iki satır eklenir; başka rol ve işlem değişmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'vardiya.durus-yaz';
  RAISE NOTICE 'rol_islemi: % vardiya.durus-yaz satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'vardiya.durus-yaz'),
    ('planlama_proje', 'vardiya.durus-yaz')
  ) AS m (kod, islem);
