-- 3437 a (dilim 2): talep kalemi malzeme kartının alternatif zarfını (3437-1) kabul sınırı olarak taşır; talep eden yalnız daraltır.
-- Boş sütun "zarfın tamamı" demektir: var olan kalemler bugünkü gibi zarfla değerlendirilir, veri değişmez. Yalnız ekleyen göç.
--   yalniz_ayni: satın alma alternatif seçemez (öteki alanlar boş olur).
--   sartli_kabul: şartlı muadili talep eden baştan kabul eder (satın almada ayrıca onaya sorulmaz).
--   kabul_kaliteleri, kabul_durumlari: zarfın muadillerinden kabul edilenler; boş liste "yalnız istenen".
--   kabul_pay_mm: kesit ölçüsünde istenenin üstüne en çok bu kadar; zarfın payından büyükse zarfın payı geçerlidir.
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN yalniz_ayni boolean NOT NULL DEFAULT false,
  ADD COLUMN sartli_kabul boolean NOT NULL DEFAULT false,
  ADD COLUMN kabul_kaliteleri text[] CONSTRAINT satin_alma_talep_kalemi_kabul_kaliteleri CHECK (cardinality(kabul_kaliteleri) <= 50),
  ADD COLUMN kabul_durumlari text[] CONSTRAINT satin_alma_talep_kalemi_kabul_durumlari CHECK (cardinality(kabul_durumlari) <= 50),
  ADD COLUMN kabul_pay_mm numeric(10,3) CONSTRAINT satin_alma_talep_kalemi_kabul_pay CHECK (kabul_pay_mm BETWEEN 0 AND 1000),
  ADD CONSTRAINT satin_alma_talep_kalemi_yalniz_ayni CHECK (
    NOT yalniz_ayni OR (NOT sartli_kabul AND kabul_kaliteleri IS NULL AND kabul_durumlari IS NULL AND kabul_pay_mm IS NULL)
  );
