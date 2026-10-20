-- Arkon Planlama'yı kullanan planlama rolü TMI işini de sıralar; sıra plandan gelir, sıralama plan.yaz ister (kart #505,
-- kullanıcı kararı 2026-10-11). Yalnız planlama_proje rolüne tek satır eklenir; başka rol ve işlem değişmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'plan.yaz';
  RAISE NOTICE 'rol_islemi: % plan.yaz satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'plan.yaz')
  ) AS m (kod, islem);
