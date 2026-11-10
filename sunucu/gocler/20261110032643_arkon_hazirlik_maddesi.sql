-- Üretim Hazırlık'ın iş emrine özel hazırlık maddesi (kart 2227, karar 2227-1 b): rota talimatı dışında o işe özgü yapılacak iş.
-- Hazırlık matrisinde yalnız uyarır; başlatmayı durdurmaz. İki tablo da yeni boş tablodur ve yalnız eklenir: maddenin hâli son olayından
-- çıkar (emir_adimi_olayi ile aynı kalıp), kaldırılan madde de iz bırakır.
CREATE TABLE arkon_hazirlik_maddesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Yabancı anahtar BİLİNÇLİ YOK: iş emri satırına anahtar, ekleme işlemine KEY SHARE kilidi verir; TMI komutlarının FOR UPDATE'iyle
  -- çakışır (arkon_kuyruk_sirasi ile aynı gerekçe). İş emrinin varlığı ve kapanmamışlığı serviste uretim-emirleri disari.ts ile denetlenir.
  is_emri_id int NOT NULL CONSTRAINT arkon_hazirlik_maddesi_is_emri_pozitif CHECK (is_emri_id > 0),
  ad text NOT NULL CONSTRAINT arkon_hazirlik_maddesi_ad_bicimi CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arkon_hazirlik_maddesi_is_emri_idx ON arkon_hazirlik_maddesi (is_emri_id, id);
CREATE TRIGGER arkon_hazirlik_maddesi_degismez BEFORE UPDATE OR DELETE ON arkon_hazirlik_maddesi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER arkon_hazirlik_maddesi_bosaltilmaz BEFORE TRUNCATE ON arkon_hazirlik_maddesi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE arkon_hazirlik_maddesi_olayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  madde_id int NOT NULL REFERENCES arkon_hazirlik_maddesi (id),
  olay text NOT NULL CONSTRAINT arkon_hazirlik_maddesi_olayi_olay_bicimi CHECK (olay IN ('tamamla', 'geri-al', 'kaldir')),
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arkon_hazirlik_maddesi_olayi_madde_idx ON arkon_hazirlik_maddesi_olayi (madde_id, id);
CREATE TRIGGER arkon_hazirlik_maddesi_olayi_degismez BEFORE UPDATE OR DELETE ON arkon_hazirlik_maddesi_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER arkon_hazirlik_maddesi_olayi_bosaltilmaz BEFORE TRUNCATE ON arkon_hazirlik_maddesi_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
