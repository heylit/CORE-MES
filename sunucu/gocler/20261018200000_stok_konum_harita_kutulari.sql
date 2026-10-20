-- QR teslim (karar 97): Fabrika Haritası'nın bütün kutuları stok barındırır; oda, cam oda, bölge, karantina, sevkiyat ve palet
-- kutuları da stok konumu olur. Yalnız tür listesi genişler; var olan satırlar değişmez, silinmez.
DO $$
DECLARE konum bigint;
BEGIN
  SELECT count(*) INTO konum FROM stok_konum;
  RAISE NOTICE 'stok_konum_harita_kutulari: % konum satiri degismez.', konum;
END $$;

ALTER TABLE stok_konum
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan', 'hurda', 'yolda',
    'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet'));
