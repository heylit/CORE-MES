-- 3337-2 a: iş adımı refakat kartı okutularak ya da yetkili kişinin gerekçesiyle kartsız başlar; her ilk başlatma iz bırakır, silinmez.
CREATE TABLE stok_refakat_baslatma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL, -- Aşama 2: yabancı anahtar ayrı göçle (stok_refakat_partisi gibi)
  is_emri_id int NOT NULL,
  refakat_partisi_id int REFERENCES stok_refakat_partisi,
  gerekce text CONSTRAINT stok_refakat_baslatma_gerekce_dolu CHECK (gerekce IS NULL OR (btrim(gerekce) <> '' AND length(gerekce) <= 500)),
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stok_refakat_baslatma_kart_ya_da_gerekce CHECK ((refakat_partisi_id IS NULL) <> (gerekce IS NULL))
);
CREATE INDEX stok_refakat_baslatma_kart ON stok_refakat_baslatma (refakat_partisi_id, zaman) WHERE refakat_partisi_id IS NOT NULL;
CREATE INDEX stok_refakat_baslatma_emir ON stok_refakat_baslatma (uretim_emri_id, zaman);
CREATE TRIGGER stok_refakat_baslatma_yalniz_ekleme BEFORE UPDATE OR DELETE ON stok_refakat_baslatma
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_refakat_baslatma_bosaltilmaz BEFORE TRUNCATE ON stok_refakat_baslatma
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
