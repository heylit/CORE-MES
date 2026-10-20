-- Talep açan roller ana menüde Planlama altındaki Taleplerim sayfasını görür (kullanıcı kararı 12.10.2026, "Evet, ekle"):
-- sayfa işlemi `satin-alma.talep-ac` taşıyan rollerin hepsine verilir. Yönetici bayraklı roldür, kayıtlı her işlemi satırsız alır.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'sayfa.taleplerim';
  RAISE NOTICE 'rol_islemi: % taleplerim sayfası satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('satin_alma', 'sayfa.taleplerim'),
    ('mudur', 'sayfa.taleplerim'),
    ('planlama_proje', 'sayfa.taleplerim'),
    ('cam', 'sayfa.taleplerim'),
    ('bakim', 'sayfa.taleplerim'),
    ('kalite', 'sayfa.taleplerim'),
    ('depo', 'sayfa.taleplerim'),
    ('insan_kaynaklari', 'sayfa.taleplerim'),
    ('idari_isler', 'sayfa.taleplerim')
  ) AS m (kod, islem);
