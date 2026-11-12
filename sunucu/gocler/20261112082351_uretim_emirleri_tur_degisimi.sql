-- Bölünmüş alt emrin türü sonradan değişir (3099); kim, ne zaman, neyi neye çevirdi kaydı yalnız eklenir. Var olan tabloya dokunulmaz.
CREATE TABLE uretim_emirleri_tur_degisimi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT uretim_emirleri_tur_degisimi_tekil PRIMARY KEY,
  uretim_emri_id int NOT NULL CONSTRAINT uretim_emirleri_tur_degisimi_emir REFERENCES uretim_emri (id),
  eski_tur text NOT NULL CONSTRAINT uretim_emirleri_tur_degisimi_eski
    CHECK (eski_tur IN ('seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason')),
  yeni_tur text NOT NULL CONSTRAINT uretim_emirleri_tur_degisimi_yeni
    CHECK (yeni_tur IN ('seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason')),
  kisi_id int NOT NULL CONSTRAINT uretim_emirleri_tur_degisimi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL,
  CONSTRAINT uretim_emirleri_tur_degisimi_farkli CHECK (eski_tur <> yeni_tur)
);
CREATE INDEX uretim_emirleri_tur_degisimi_emir_dizini ON uretim_emirleri_tur_degisimi (uretim_emri_id, id);

CREATE TRIGGER uretim_emirleri_tur_degisimi_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_tur_degisimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_tur_degisimi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_tur_degisimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
