-- 3458 (1 b, 2 a): görevin içi. Yapılacak adımlar ilerlemeyi verir, notlar yalnız eklenir, kanıtı zorunlu görev kanıtsız bitmez.
-- Kanıt dosyası dosya modülünün bağındadır (modül 'projeler', kayıt 'gorev:<id>'); burada yalnız zorunluluk durur. Göç yalnız ekler.

ALTER TABLE projeler_gorev ADD COLUMN kanit_zorunlu boolean NOT NULL DEFAULT false;

-- Adım, işaretlenince kimin ve ne zaman işaretlediğini taşır; işaret kalkınca ikisi de boşalır.
-- Görev başına en çok 50 adım sunucuda sayılır; silinen adımın sırası boş kalır.
CREATE TABLE projeler_gorev_adimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gorev_id int NOT NULL CONSTRAINT projeler_gorev_adimi_gorev REFERENCES projeler_gorev (id),
  sira int NOT NULL CONSTRAINT projeler_gorev_adimi_sira_araligi CHECK (sira >= 1),
  ad text NOT NULL CONSTRAINT projeler_gorev_adimi_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 200),
  yapildi boolean NOT NULL DEFAULT false,
  yapan_id int CONSTRAINT projeler_gorev_adimi_yapan REFERENCES kisi (id),
  an timestamptz,
  CONSTRAINT projeler_gorev_adimi_sirasi UNIQUE (gorev_id, sira),
  CONSTRAINT projeler_gorev_adimi_isaret_butun CHECK ((yapildi AND yapan_id IS NOT NULL AND an IS NOT NULL) OR (NOT yapildi AND yapan_id IS NULL AND an IS NULL))
);

-- Not, görevin konuşmasıdır: yalnız eklenir, değişmez, silinmez.
CREATE TABLE projeler_gorev_notu (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gorev_id int NOT NULL CONSTRAINT projeler_gorev_notu_gorev REFERENCES projeler_gorev (id),
  kisi_id int NOT NULL CONSTRAINT projeler_gorev_notu_kisi REFERENCES kisi (id),
  metin text NOT NULL CONSTRAINT projeler_gorev_notu_metin_bicim CHECK (btrim(metin) = metin AND length(metin) BETWEEN 1 AND 2000),
  an timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projeler_gorev_notu_gorev_idx ON projeler_gorev_notu (gorev_id, an, id);
CREATE TRIGGER projeler_gorev_notu_degismez BEFORE UPDATE OR DELETE ON projeler_gorev_notu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_gorev_notu_bosaltilmaz BEFORE TRUNCATE ON projeler_gorev_notu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
