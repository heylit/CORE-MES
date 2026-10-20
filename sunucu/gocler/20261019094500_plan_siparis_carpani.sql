-- Elle çarpan (öncelik kurgusu §7, 195 a): planlamacı ya da müdür siparişin gecikme bedelini gerekçeyle çarpar. Kayıt yalnız eklenir:
-- geçerli çarpan siparişin son satırıdır, eskiler kimin ne zaman neden verdiğini gösterir.
CREATE TABLE plan_siparis_carpani (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT plan_siparis_carpani_tekil PRIMARY KEY,
  siparis_id int NOT NULL CONSTRAINT plan_siparis_carpani_siparis REFERENCES siparisler_siparis (id),
  carpan numeric(3, 2) NOT NULL CONSTRAINT plan_siparis_carpani_aralik CHECK (carpan BETWEEN 0.5 AND 3),
  gerekce text NOT NULL CONSTRAINT plan_siparis_carpani_gerekce CHECK (length(btrim(gerekce)) BETWEEN 1 AND 500),
  kisi_id int NOT NULL CONSTRAINT plan_siparis_carpani_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_siparis_carpani_siparis_son ON plan_siparis_carpani (siparis_id, id DESC);

CREATE TRIGGER plan_siparis_carpani_degismez BEFORE UPDATE OR DELETE ON plan_siparis_carpani
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_siparis_carpani_bosaltilmaz BEFORE TRUNCATE ON plan_siparis_carpani
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
