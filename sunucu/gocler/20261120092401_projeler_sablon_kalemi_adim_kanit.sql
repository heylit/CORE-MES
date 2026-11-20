-- 3458 (dilim 2): şablon kalemi görevin içini de taşır. Görevleri dağıt ekranı kalemden görev açarken yapılacak adımları ve
-- kanıt zorunluluğunu göreve geçirir. Göç yalnız ekler; var olan kalemler adımsız ve kanıtsız kalır.

ALTER TABLE projeler_gorev_sablon_kalemi
  ADD COLUMN adimlar text[] NOT NULL DEFAULT '{}'
    CONSTRAINT projeler_gorev_sablon_kalemi_adim_siniri CHECK (cardinality(adimlar) <= 50 AND array_position(adimlar, NULL) IS NULL),
  ADD COLUMN kanit_zorunlu boolean NOT NULL DEFAULT false;
