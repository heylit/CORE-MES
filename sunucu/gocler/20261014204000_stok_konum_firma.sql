-- Fason firma fabrikanın bir konumu gibi izlenir (kart #1310): gönderilen parça önce firmanın "Yolda" konumuna, sevkiyat teslim
-- onayında firmanın fason konumuna geçer. Firma başına her türden tek konum olur; elle açılan firmasız fason konumu kalır.
ALTER TABLE stok_konum
  ADD COLUMN firma_id int CONSTRAINT stok_konum_firma_var REFERENCES musteri_tedarikci_firma (id),
  DROP CONSTRAINT stok_konum_tur_degeri,
  ADD CONSTRAINT stok_konum_tur_degeri CHECK (tur IN ('raf_gozu', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'istasyon', 'ara_alan', 'hurda', 'yolda')),
  ADD CONSTRAINT stok_konum_firma_turu CHECK ((tur = 'yolda') <= (firma_id IS NOT NULL) AND (firma_id IS NULL OR tur IN ('fason', 'yolda'))),
  ADD CONSTRAINT stok_konum_firma_tek UNIQUE (firma_id, tur);
