-- Canlı sayım ve duruş olayı defterleri; ikisi de yalnız eklenir. Emir durumu bu tablolardan türemez:
-- çalışma durumu son olaydan, sayaçlar sayım toplamından okunur (uretim_emri değişmedi).
CREATE TABLE uretim_sayimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL REFERENCES istasyon,
  tur text NOT NULL CONSTRAINT uretim_sayimi_tur_degeri CHECK (tur IN ('saglam', 'hurda')),
  adet int NOT NULL CONSTRAINT uretim_sayimi_adet_sifir_degil CHECK (adet <> 0),
  hurda_nedeni_id int REFERENCES hurda_nedeni,
  -- Sağlam sayacının elle değişmesi (eksiltme, tuş takımı, bitişte farklı adet) defterde düzeltme olarak görünür.
  duzeltme boolean NOT NULL DEFAULT false,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_sayimi_hurda_nedenli CHECK ((tur = 'hurda') = (hurda_nedeni_id IS NOT NULL)),
  CONSTRAINT uretim_sayimi_hurda_artar CHECK (tur <> 'hurda' OR adet > 0),
  CONSTRAINT uretim_sayimi_hurda_duzeltme_degil CHECK (tur <> 'hurda' OR NOT duzeltme),
  CONSTRAINT uretim_sayimi_eksilen_duzeltmedir CHECK (adet > 0 OR duzeltme)
);
CREATE INDEX uretim_sayimi_emir_idx ON uretim_sayimi (emir_id, id);

CREATE TABLE uretim_olayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL REFERENCES istasyon,
  olay text NOT NULL CONSTRAINT uretim_olayi_olay_degeri CHECK (olay IN ('duraklat', 'durdur', 'devam')),
  durus_nedeni_id int REFERENCES durus_nedeni,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_olayi_durdur_nedenli CHECK ((olay = 'durdur') = (durus_nedeni_id IS NOT NULL))
);
CREATE INDEX uretim_olayi_emir_idx ON uretim_olayi (emir_id, id);

CREATE TRIGGER uretim_sayimi_degismez BEFORE UPDATE OR DELETE ON uretim_sayimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_sayimi_bosaltilmaz BEFORE TRUNCATE ON uretim_sayimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_olayi_degismez BEFORE UPDATE OR DELETE ON uretim_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_olayi_bosaltilmaz BEFORE TRUNCATE ON uretim_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
