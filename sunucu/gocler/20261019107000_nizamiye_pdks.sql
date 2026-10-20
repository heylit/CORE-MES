-- Nizamiye 243 a: PDKS'nin verdiği giriş-çıkış dosyası içe aktarılır (ağ bağlantısı yok); acil durum listesi personelde bundan okur.
-- Hareketler yalnız eklenir; aynı dosya iki kez aktarılırsa aynı hareket ikinci kez yazılmaz (kişi, zaman, yön tek).
CREATE TABLE nizamiye_pdks_aktarim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dosya_adi text NOT NULL CONSTRAINT nizamiye_pdks_aktarim_dosya_uzunluk CHECK (length(dosya_adi) BETWEEN 1 AND 200),
  aktaran_kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  satir_sayisi int NOT NULL CONSTRAINT nizamiye_pdks_aktarim_satir_negatif_degil CHECK (satir_sayisi >= 0),
  eslesmeyen int NOT NULL CONSTRAINT nizamiye_pdks_aktarim_eslesmeyen_negatif_degil CHECK (eslesmeyen >= 0)
);

CREATE TABLE nizamiye_pdks_hareket (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL,
  yon text NOT NULL CONSTRAINT nizamiye_pdks_hareket_yon_secenek CHECK (yon IN ('giris', 'cikis')),
  aktarim_id int NOT NULL REFERENCES nizamiye_pdks_aktarim,
  CONSTRAINT nizamiye_pdks_hareket_tek UNIQUE (kisi_id, zaman, yon)
);

-- Acil durum listesi her kişinin son hareketini zamana göre arar.
CREATE INDEX nizamiye_pdks_hareket_kisi_zaman ON nizamiye_pdks_hareket (kisi_id, zaman DESC, id DESC);

CREATE TRIGGER nizamiye_pdks_hareket_degismez BEFORE UPDATE OR DELETE ON nizamiye_pdks_hareket
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_hareket_bosaltilmaz BEFORE TRUNCATE ON nizamiye_pdks_hareket
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_aktarim_degismez BEFORE UPDATE OR DELETE ON nizamiye_pdks_aktarim
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_aktarim_bosaltilmaz BEFORE TRUNCATE ON nizamiye_pdks_aktarim
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
