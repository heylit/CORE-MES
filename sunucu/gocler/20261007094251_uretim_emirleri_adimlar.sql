-- Emrin talimat adımları (kontrol listesi): emir açılırken yazılır ve sonra değişmez; işaretlemeler ayrı olay defteridir.
-- Adımın güncel durumu son olaydan türer (tamamla ise yapıldı, geri-al ise yapılmadı); ikisi de yalnız eklenir.
CREATE TABLE emir_adimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  sira int NOT NULL CONSTRAINT emir_adimi_sira_pozitif CHECK (sira > 0),
  ad text NOT NULL CONSTRAINT emir_adimi_ad_bicimi CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  aciklama text CONSTRAINT emir_adimi_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 300)),
  CONSTRAINT emir_adimi_sira_benzersiz UNIQUE (emir_id, sira)
);

CREATE TABLE emir_adimi_olayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim_id int NOT NULL REFERENCES emir_adimi,
  kisi_id int NOT NULL REFERENCES kisi,
  olay text NOT NULL CONSTRAINT emir_adimi_olayi_olay_degeri CHECK (olay IN ('tamamla', 'geri-al')),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emir_adimi_olayi_adim_idx ON emir_adimi_olayi (adim_id, id);

CREATE TRIGGER emir_adimi_degismez BEFORE UPDATE OR DELETE ON emir_adimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adimi_bosaltilmaz BEFORE TRUNCATE ON emir_adimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adimi_olayi_degismez BEFORE UPDATE OR DELETE ON emir_adimi_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER emir_adimi_olayi_bosaltilmaz BEFORE TRUNCATE ON emir_adimi_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
