-- Serbest ara alan (kart #1289): fabrika içinde istasyona bağlı olmayan harfli bekleme yeri (ör. "B-4 bekleme"). Buraya bırakılan teslim
-- bırakıldığı an alınmış sayılır. Yalnız tür listesi genişler; var olan satırlar değişmez, silinmez.
DO $$
DECLARE konum bigint;
BEGIN
  SELECT count(*) INTO konum FROM stok_konum;
  RAISE NOTICE 'stok_ara_alan: % konum satiri degismez.', konum;
END $$;

ALTER TABLE stok_konum
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan'));
