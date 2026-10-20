-- Operatör Üretim Terminali sayfasını görür (kullanıcı kararı 11.10.2026, kart #568: "sayfa.uretim-terminali operatör ve
-- yöneticiye verilsin"). Yönetici bayraklı roldür, kayıtlı her işlemi satırsız alır.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem = 'sayfa.uretim-terminali';
  RAISE NOTICE 'rol_islemi: % üretim terminali satırı var; göç yalnız satır ekler', satir;
END $$;

-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('operator', 'sayfa.uretim-terminali')) AS m (kod, islem);
