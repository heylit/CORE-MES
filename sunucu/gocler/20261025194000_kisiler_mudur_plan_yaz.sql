-- Müdür planlama çalışmasını da değiştirir ve onayladığı planı canlıya alır; plan.yaz müdüre de verilir (kart #524 soru 3 b,
-- kullanıcı kararı 2026-10-25; 290 b'deki "müdür plan yazmaz" bu kararla değişti). Yalnız mudur rolüne tek satır eklenir; başka rol ve işlem değişmez.

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
    ('mudur', 'plan.yaz')
  ) AS m (kod, islem);
