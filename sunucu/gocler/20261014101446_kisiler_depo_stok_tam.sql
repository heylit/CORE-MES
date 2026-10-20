-- Depo rolü Stok Merkezi'nin bütün işlemlerine yetkilidir (kullanıcı kararı 14.10.2026, kart #1225): raf ve konum tanımı ile
-- hareketi geri alma da depoya verilir. Stok Merkezi'nin Yönetici görünümü bu yetkiden türer; ekranda elle seçilmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi WHERE islem IN ('stok.tanim', 'stok.geri-al');
  RAISE NOTICE 'rol_islemi: % stok.tanim / stok.geri-al satırı var; göç yalnız satır ekler', satir;
END $$;

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('depo', 'stok.tanim'),
    ('depo', 'stok.geri-al')
  ) AS m (kod, islem);
