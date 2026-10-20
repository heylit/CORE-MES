-- Finans işlemleri rollere verilir (kart #223, kullanıcı kararı RC1 R8-R12): firma kartı finans rakamlarından ayrı açılır.
-- Satın alma ve planlama firma kartını açar ve düzeltir, rakam görmez; depo mal kabulde tedarikçi adını okur, sayfa almaz.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'sayfa.finans' OR islem LIKE 'finans.%';
  RAISE NOTICE 'rol_islemi: % finans satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('muhasebe_finans', 'sayfa.finans'),
    ('muhasebe_finans', 'finans.oku'),
    ('muhasebe_finans', 'finans.yaz'),
    ('muhasebe_finans', 'finans.yonet'),
    ('muhasebe_finans', 'finans.firma-oku'),
    ('muhasebe_finans', 'finans.firma-yaz'),
    ('mudur', 'sayfa.finans'),
    ('mudur', 'finans.oku'),
    ('mudur', 'finans.firma-oku'),
    ('satin_alma', 'sayfa.finans'),
    ('satin_alma', 'finans.firma-oku'),
    ('satin_alma', 'finans.firma-yaz'),
    ('planlama_proje', 'sayfa.finans'),
    ('planlama_proje', 'finans.firma-oku'),
    ('planlama_proje', 'finans.firma-yaz'),
    ('depo', 'finans.firma-oku')
  ) AS m (kod, islem);
