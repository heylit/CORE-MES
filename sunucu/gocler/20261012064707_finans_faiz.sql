-- Günlük faiz oranı tarihli tutulur: yeni oran başlangıç gününden sonrasını etkiler, önceki oranlar silinmez ve değişmez.
CREATE TABLE finans_faiz (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  para_birimi char(3) NOT NULL CONSTRAINT finans_faiz_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  gecerlilik_baslangic date NOT NULL,
  aylik_yuzde numeric(8,4) NOT NULL CONSTRAINT finans_faiz_aralik CHECK (aylik_yuzde >= 0 AND aylik_yuzde <= 100),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finans_faiz_degismez BEFORE UPDATE OR DELETE ON finans_faiz
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_faiz_bosaltilmaz BEFORE TRUNCATE ON finans_faiz
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
