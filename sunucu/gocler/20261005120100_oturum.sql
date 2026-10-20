-- Oturum anahtarı saklanmaz; yalnız özeti tutulur.
CREATE TABLE oturum (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anahtar_ozeti text NOT NULL UNIQUE,
  kisi_id int NOT NULL REFERENCES kisi,
  acildi timestamptz NOT NULL DEFAULT now(),
  son_gorulme timestamptz NOT NULL DEFAULT now(),
  kapandi timestamptz
);
CREATE INDEX oturum_kisi ON oturum (kisi_id);

CREATE FUNCTION yalniz_ekleme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır', TG_TABLE_NAME;
END $$;

CREATE TABLE giris_denemesi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kullanici_adi text NOT NULL,
  sonuc text NOT NULL CHECK (sonuc IN ('basarili', 'hatali', 'kilitli')),
  ip text,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX giris_denemesi_ad_zaman ON giris_denemesi (kullanici_adi, zaman DESC);

CREATE TRIGGER giris_denemesi_degismez BEFORE UPDATE OR DELETE ON giris_denemesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER giris_denemesi_bosaltilmaz BEFORE TRUNCATE ON giris_denemesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
