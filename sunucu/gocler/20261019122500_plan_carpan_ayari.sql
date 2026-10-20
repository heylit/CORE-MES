-- Öncelik çarpanları (195 a) koddan müdürün bedel ayarına, müşteri sınıfı çarpanları (265 a) yeni olarak eklenir (denetim #21). Yalnız
-- sütun eklenir; öncelik varsayılanları kodun bugünkü değerleridir, sınıf varsayılanları kurgu §2 önerisidir (A 1,5, B 1, C 0,7).
ALTER TABLE plan_ayari
  ADD COLUMN yuksek_carpani numeric(4, 2) NOT NULL DEFAULT 2 CONSTRAINT plan_ayari_yuksek_carpani CHECK (yuksek_carpani > 0 AND yuksek_carpani <= 5),
  ADD COLUMN normal_carpani numeric(4, 2) NOT NULL DEFAULT 1 CONSTRAINT plan_ayari_normal_carpani CHECK (normal_carpani > 0 AND normal_carpani <= 5),
  ADD COLUMN dusuk_carpani numeric(4, 2) NOT NULL DEFAULT 0.5 CONSTRAINT plan_ayari_dusuk_carpani CHECK (dusuk_carpani > 0 AND dusuk_carpani <= 5),
  ADD COLUMN sinif_a_carpani numeric(4, 2) NOT NULL DEFAULT 1.5 CONSTRAINT plan_ayari_sinif_a_carpani CHECK (sinif_a_carpani > 0 AND sinif_a_carpani <= 5),
  ADD COLUMN sinif_b_carpani numeric(4, 2) NOT NULL DEFAULT 1 CONSTRAINT plan_ayari_sinif_b_carpani CHECK (sinif_b_carpani > 0 AND sinif_b_carpani <= 5),
  ADD COLUMN sinif_c_carpani numeric(4, 2) NOT NULL DEFAULT 0.7 CONSTRAINT plan_ayari_sinif_c_carpani CHECK (sinif_c_carpani > 0 AND sinif_c_carpani <= 5);
