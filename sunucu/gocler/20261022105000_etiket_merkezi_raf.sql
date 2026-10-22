-- Raf etiketi (#116, Soru 110 onaylı): Fabrika Haritası rafının etiketi de deftere yazılır. Yalnız basılan kayıt türü listesi
-- genişler; var olan satırlar değişmez, silinmez.
DO $$
DECLARE kayit bigint;
BEGIN
  SELECT count(*) INTO kayit FROM etiket_merkezi_baski_kaydi;
  RAISE NOTICE 'etiket_merkezi_raf: % baski kaydi satiri degismez.', kayit;
END $$;

ALTER TABLE etiket_merkezi_baski_kaydi DROP CONSTRAINT etiket_merkezi_baski_kaydi_tur,
  ADD CONSTRAINT etiket_merkezi_baski_kaydi_tur CHECK (kaynak_tur IN ('konum', 'raf', 'lot', 'istasyon', 'refakat', 'malzeme'));
