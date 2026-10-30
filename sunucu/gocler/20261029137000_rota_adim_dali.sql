-- Çok dallı rota (1248 a): adımın dalı ve birleştirme adımında birleşen dallar. Öncül listesi saklanmaz; dal, birleşen dallar,
-- sıra ve bağımlılıktan kurallar.ts'te türetilir. Satırı olmayan adım ana hattadır ve birleştirme yapmaz (bugünkü davranış).
-- Adımla birlikte yazılır ve silinir (sorgular.ts icerikSil); içerik kilidi (yalnız taslak) adımın diğer alt tablolarıyla aynıdır.
CREATE TABLE rota_adim_dali (
  adim_id int PRIMARY KEY REFERENCES rota_adimi,
  dal text CONSTRAINT rota_adim_dali_dal_bicimi CHECK (dal ~ '^[A-Z]$'),
  birlesen text[] NOT NULL DEFAULT '{}'
    CONSTRAINT rota_adim_dali_birlesen_bicimi CHECK (array_to_string(birlesen, '') ~ '^[A-Z]*$' AND cardinality(birlesen) <= 26),
  CONSTRAINT rota_adim_dali_bos_degil CHECK (dal IS NOT NULL OR cardinality(birlesen) > 0)
);
CREATE TRIGGER rota_adim_dali_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_adim_dali
  FOR EACH ROW EXECUTE FUNCTION rota_icerik_kilitli();
