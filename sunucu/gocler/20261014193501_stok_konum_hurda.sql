-- Hurda konumu (kart #1304): hurdaya ayrılan malzemenin durduğu yer; kullanılabilir stoğa ve çıkış önerisine girmez. Yalnız tür
-- listesi genişler; var olan satırlar değişmez, silinmez.
DO $$
DECLARE konum bigint;
BEGIN
  SELECT count(*) INTO konum FROM stok_konum;
  RAISE NOTICE 'stok_konum_hurda: % konum satiri degismez.', konum;
END $$;

ALTER TABLE stok_konum
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan', 'hurda'));
