-- Planlama ve Proje satın alma sayfasını görür (kullanıcı kararı 11.10.2026, kart #223): sayfa işlemi menüyü, okuma
-- işlemi sayfanın açılış ucunu verir; okuma olmadan sayfa boş açılırdı. Yazma ve onay verilmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem IN ('sayfa.satin-alma', 'satin-alma.oku');
  RAISE NOTICE 'rol_islemi: % satın alma sayfa ve okuma satırı var; göç yalnız satır ekler', satir;
END $$;

-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'sayfa.satin-alma'),
    ('planlama_proje', 'satin-alma.oku')
  ) AS m (kod, islem);
