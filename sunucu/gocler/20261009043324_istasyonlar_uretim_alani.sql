-- Stoktaki üretim alanı konumu işaretli istasyona bağlanır (SH5 b). İşaret boş olamaz, varsayılanı "hayır" (UA1 a):
-- var olan satırlar işaretsiz başlar, satır silinmez, başka değer değişmez. Önce sayılır ve iletiyle yazılır.
DO $$
DECLARE
  satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM istasyon;
  RAISE NOTICE 'istasyon: % satır; hepsi üretim alanı işaretsiz başlar', satir;
END $$;

ALTER TABLE istasyon ADD COLUMN uretim_alani boolean NOT NULL DEFAULT false;
