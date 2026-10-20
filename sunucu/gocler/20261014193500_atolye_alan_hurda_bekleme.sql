-- Haritada alana hurda ve bekleme (ara alan) türü atanabilir (kart #1304); depo bölümü olmasa da stok konumu olur. Yalnız tür
-- listesi genişler; var olan satırlar değişmez, silinmez.
DO $$
DECLARE alan bigint;
BEGIN
  SELECT count(*) INTO alan FROM atolye_alan;
  RAISE NOTICE 'atolye_alan_hurda_bekleme: % alan satiri degismez.', alan;
END $$;

ALTER TABLE atolye_alan
  DROP CONSTRAINT atolye_alan_tur_degeri,
  ADD CONSTRAINT atolye_alan_tur_degeri CHECK (tur IN ('yuruyus_yolu', 'bolge', 'karantina', 'sevkiyat', 'oda', 'cam_oda', 'palet',
    'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'ara_alan', 'hurda'));
