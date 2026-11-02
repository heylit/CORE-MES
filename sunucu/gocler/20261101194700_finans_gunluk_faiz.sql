-- 1700 b, 1725 a: günlük faiz aylığa çevrilmeden kendi tablosunda tutulur; hesapların hangi birimi kullanacağı finans ayarındadır.
-- Dolu finans_faiz'e dokunulmaz. Ayara eklenen sütun varsayılanla gelir: mevcut davranış (aylık) sürer.
CREATE TABLE finans_gunluk_faiz (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  para_birimi char(3) NOT NULL CONSTRAINT finans_gunluk_faiz_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  gecerlilik_baslangic date NOT NULL,
  gunluk_yuzde numeric(10,6) NOT NULL CONSTRAINT finans_gunluk_faiz_aralik CHECK (gunluk_yuzde >= 0 AND gunluk_yuzde * 365 / 12 <= 100),
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finans_gunluk_faiz_gecerli ON finans_gunluk_faiz (para_birimi, gecerlilik_baslangic DESC, id DESC);

CREATE TRIGGER finans_gunluk_faiz_degismez BEFORE UPDATE OR DELETE ON finans_gunluk_faiz
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_gunluk_faiz_bosaltilmaz BEFORE TRUNCATE ON finans_gunluk_faiz
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

ALTER TABLE finans_ayar ADD COLUMN faiz_birimi text NOT NULL DEFAULT 'aylik'
  CONSTRAINT finans_ayar_faiz_birimi CHECK (faiz_birimi IN ('aylik', 'gunluk'));
