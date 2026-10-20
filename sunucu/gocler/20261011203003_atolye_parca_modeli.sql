-- Parça modeli: makinede işlenen parçanın 3B modeli, kütüphanedeki modelle parça numarasına bağlanır. Üretim emrindeki
-- parça no serbest metindir; eşleme anahtarı boşluk ve büyük/küçük harf farkını siler (uygulamada `parcaAnahtari`).
-- Bir parça numarasının tek modeli vardır; atanan model silinmez (yabancı anahtar).

CREATE TABLE atolye_parca_modeli (
  parca_anahtari text PRIMARY KEY,
  parca_no text NOT NULL,
  model_id int NOT NULL REFERENCES atolye_model,
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atolye_parca_modeli_no CHECK (btrim(parca_no) <> '' AND length(parca_no) <= 60),
  CONSTRAINT atolye_parca_modeli_anahtari CHECK (parca_anahtari <> '' AND parca_anahtari = btrim(parca_anahtari) AND parca_anahtari !~ '\s\s')
);
CREATE INDEX atolye_parca_modeli_model ON atolye_parca_modeli (model_id);

-- Parçaya yalnız yüklemesi tamamlanmış model bağlanır.
CREATE FUNCTION atolye_parca_modeli_tamam() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM atolye_model WHERE id = NEW.model_id AND tamam) THEN
    RAISE EXCEPTION 'Modelin yüklemesi tamamlanmamış' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_parca_modeli_tamam';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_parca_modeli_tamam BEFORE INSERT OR UPDATE OF model_id ON atolye_parca_modeli
  FOR EACH ROW EXECUTE FUNCTION atolye_parca_modeli_tamam();
