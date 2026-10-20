-- İnsan Kaynakları ve İdari İşler satın alma talebi açar (kullanıcı kararı 11.10.2026): ana sayfadaki "Talep aç" ve
-- "Taleplerim" kartları `satin-alma.talep-ac` olana görünür. Satın alma sayfası, okuma, yazma ve onay verilmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'satin-alma.talep-ac';
  RAISE NOTICE 'rol_islemi: % satın alma talep satırı var; göç yalnız satır ekler', satir;
END $$;

-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('insan_kaynaklari', 'satin-alma.talep-ac'),
    ('idari_isler', 'satin-alma.talep-ac')
  ) AS m (kod, islem);
