-- 3306 a: şablonun varsayılan etiket ölçüsü bütün cihazlar için değiştirilir; tasarım kodda kalır, orantılı ölçeklenir (3011 a).
-- Defter yalnız eklenir: kim ne zaman hangi ölçüyü koydu kaybolmaz. Şablonun en son satırı etkindir; boş ölçü tasarım ölçüsüne dönüştür.
CREATE TABLE etiket_merkezi_sablon_olcusu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sablon_anahtar text NOT NULL CONSTRAINT etiket_merkezi_sablon_olcusu_anahtar CHECK (sablon_anahtar ~ '^[a-z0-9-]{1,40}$'),
  genislik numeric(4, 1) CONSTRAINT etiket_merkezi_sablon_olcusu_en CHECK (genislik BETWEEN 10 AND 110),
  yukseklik numeric(4, 1) CONSTRAINT etiket_merkezi_sablon_olcusu_boy CHECK (yukseklik BETWEEN 10 AND 300),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etiket_merkezi_sablon_olcusu_ikisi CHECK ((genislik IS NULL) = (yukseklik IS NULL))
);
CREATE INDEX etiket_merkezi_sablon_olcusu_son ON etiket_merkezi_sablon_olcusu (sablon_anahtar, id);
CREATE TRIGGER etiket_merkezi_sablon_olcusu_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_sablon_olcusu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
