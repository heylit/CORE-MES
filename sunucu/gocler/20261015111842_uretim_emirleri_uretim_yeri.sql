-- Açılmış emirde bir adımın içeride ya da fasonda yapılacağı adım başlamadan değiştirilebilir; kim, ne zaman, neyi neye çevirdi kaydı
-- yalnız eklenir. Önceki iç kaynak ve süreler saklanır: adım fasondan geri alınınca bunlar geri yazılır.
CREATE TABLE uretim_emirleri_uretim_yeri_degisimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  eski_makine_id int REFERENCES makine,
  eski_kisi_id int REFERENCES kisi,
  eski_fason_firma_id int REFERENCES musteri_tedarikci_firma (id),
  eski_istasyon_id int REFERENCES istasyon,
  eski_ayar_suresi_dk numeric(8, 2),
  eski_birim_sure_dk numeric(10, 4),
  eski_termin_gun int,
  yeni_fason_firma_id int REFERENCES musteri_tedarikci_firma (id),
  yeni_termin_gun int CONSTRAINT uretim_emirleri_uretim_yeri_degisimi_termin CHECK (yeni_termin_gun BETWEEN 1 AND 365),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL,
  CONSTRAINT uretim_emirleri_uretim_yeri_degisimi_fason_terminli CHECK ((yeni_fason_firma_id IS NULL) = (yeni_termin_gun IS NULL)),
  CONSTRAINT uretim_emirleri_uretim_yeri_degisimi_eski_tek_kaynak CHECK (num_nonnulls(eski_makine_id, eski_kisi_id, eski_fason_firma_id) <= 1)
);
CREATE INDEX uretim_emirleri_uretim_yeri_degisimi_is_emri_idx ON uretim_emirleri_uretim_yeri_degisimi (is_emri_id, id);

CREATE TRIGGER uretim_emirleri_uretim_yeri_degisimi_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_uretim_yeri_degisimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_uretim_yeri_degisimi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_uretim_yeri_degisimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
