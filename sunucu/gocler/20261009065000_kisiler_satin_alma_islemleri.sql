-- Satın alma işlemleri rollere verilir (kart #223, kullanıcı kararı RC1 R1-R3; ana sayfadan talep, kart #375): satın almacı
-- talepleri yürütür ve ayarları yazar; müdür onaylar (dört göz kuralı sunucuda); muhasebe okur. Talep açmayı üretimdeki
-- roller de alır (ana sayfa kartı `satin-alma.talep-ac` olana görünür); operatör almaz, ihtiyacı ustabaşına söyler.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem LIKE 'satin-alma.%' OR islem = 'sayfa.satin-alma';
  RAISE NOTICE 'rol_islemi: % satın alma satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('satin_alma', 'sayfa.satin-alma'),
    ('satin_alma', 'satin-alma.oku'),
    ('satin_alma', 'satin-alma.talep-ac'),
    ('satin_alma', 'satin-alma.yaz'),
    ('satin_alma', 'satin-alma.ayar'),
    ('mudur', 'sayfa.satin-alma'),
    ('mudur', 'satin-alma.oku'),
    ('mudur', 'satin-alma.talep-ac'),
    ('mudur', 'satin-alma.onayla'),
    ('muhasebe_finans', 'sayfa.satin-alma'),
    ('muhasebe_finans', 'satin-alma.oku'),
    ('planlama_proje', 'satin-alma.talep-ac'),
    ('cam', 'satin-alma.talep-ac'),
    ('bakim', 'satin-alma.talep-ac'),
    ('kalite', 'satin-alma.talep-ac'),
    ('depo', 'satin-alma.talep-ac')
  ) AS m (kod, islem);
