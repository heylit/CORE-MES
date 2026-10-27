-- Balonun resimdeki yeri (894 a, 913 a): elle konan balon (yer_x, yer_y) sabittir; yer_kipi tek balon için istenen yerleşimdir (yazının
-- yanı ya da kenar şeridi). İkisi de yoksa ekran balonu kendisi dizer. Sütunlar boş olabilir: dolu tablodaki satırlar değişmez,
-- bütün balonlar bugünkü gibi kendiliğinden dizilir.
ALTER TABLE kalite_merkezi_balon
  ADD COLUMN yer_x double precision,
  ADD COLUMN yer_y double precision,
  ADD COLUMN yer_kipi text CONSTRAINT kalite_merkezi_balon_yer_kipi CHECK (yer_kipi IS NULL OR yer_kipi IN ('yakin', 'serit')),
  -- Sonlu ve sayfada: NaN ve sonsuz BETWEEN'den geçmez.
  ADD CONSTRAINT kalite_merkezi_balon_yer CHECK ((yer_x IS NULL) = (yer_y IS NULL)
    AND (yer_x IS NULL OR (yer_x BETWEEN 0 AND 1000000 AND yer_y BETWEEN 0 AND 1000000)));
