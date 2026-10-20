-- Hazırlık muafiyeti (120-122 a, 264 a, denetim #14): eksik hazırlık maddesi müdürün gerekçesiyle geçilir. Yeni ve boş tablo; kayıt
-- silinmez, değişmez. İş emri boşsa muafiyet emrin bütün iş emirlerinedir. Aynı madde aynı yerde bir kez muaf tutulur.
CREATE TABLE uretim_emirleri_hazirlik_muafiyeti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emri,
  is_emri_id int REFERENCES uretim_emirleri_is_emri,
  madde text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_muafiyeti_madde CHECK (madde IN ('cnc', 'ozel-proses')),
  kisi_id int NOT NULL REFERENCES kisi,
  gerekce text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_muafiyeti_gerekce CHECK (btrim(gerekce) <> '' AND char_length(gerekce) <= 500),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uretim_emirleri_hazirlik_muafiyeti_tek ON uretim_emirleri_hazirlik_muafiyeti (uretim_emri_id, COALESCE(is_emri_id, 0), madde);
CREATE TRIGGER uretim_emirleri_hazirlik_muafiyeti_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_hazirlik_muafiyeti
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_hazirlik_muafiyeti_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_muafiyeti
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
