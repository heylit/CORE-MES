-- Kim, ne zaman, ne yaptı. kisi_id boş ise komut oturumsuz verilmiştir (giriş).
CREATE TABLE denetim_kaydi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int REFERENCES kisi,
  yontem text NOT NULL,
  yol text NOT NULL,
  parametre jsonb,
  govde jsonb
);
CREATE INDEX denetim_kaydi_zaman ON denetim_kaydi (zaman DESC);
CREATE INDEX denetim_kaydi_kisi ON denetim_kaydi (kisi_id, zaman DESC);

CREATE TRIGGER denetim_kaydi_degismez BEFORE UPDATE OR DELETE ON denetim_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER denetim_kaydi_bosaltilmaz BEFORE TRUNCATE ON denetim_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
