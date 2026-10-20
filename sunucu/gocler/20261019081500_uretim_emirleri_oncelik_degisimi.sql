-- Başlamamış emrin önceliği plan senaryosu açmadan doğrudan değişir (kullanıcı kararı 163 a); kim, ne zaman, neyi neye çevirdi kaydı
-- yalnız eklenir.
CREATE TABLE uretim_emirleri_oncelik_degisimi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT uretim_emirleri_oncelik_degisimi_tekil PRIMARY KEY,
  uretim_emri_id int NOT NULL CONSTRAINT uretim_emirleri_oncelik_degisimi_emir REFERENCES uretim_emri (id),
  eski_oncelik smallint NOT NULL CONSTRAINT uretim_emirleri_oncelik_degisimi_eski CHECK (eski_oncelik BETWEEN 1 AND 4),
  yeni_oncelik smallint NOT NULL CONSTRAINT uretim_emirleri_oncelik_degisimi_yeni CHECK (yeni_oncelik BETWEEN 1 AND 4),
  kisi_id int NOT NULL CONSTRAINT uretim_emirleri_oncelik_degisimi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL,
  CONSTRAINT uretim_emirleri_oncelik_degisimi_farkli CHECK (eski_oncelik <> yeni_oncelik)
);
CREATE INDEX uretim_emirleri_oncelik_degisimi_emir_dizini ON uretim_emirleri_oncelik_degisimi (uretim_emri_id, id);

CREATE TRIGGER uretim_emirleri_oncelik_degisimi_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_oncelik_degisimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_oncelik_degisimi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_oncelik_degisimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
