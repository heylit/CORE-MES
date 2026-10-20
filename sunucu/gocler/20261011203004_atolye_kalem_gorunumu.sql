-- Parça modeli kalem görünümüne genişler: aynı kod (parça no ya da malzeme kodu) makinede işlenen parçanın
-- önizlemesini ve depoda rafta nasıl görüneceğini (ambalaj ya da parçanın kendi modeli) taşır. Tablo yeniden
-- adlandırılır, satırlar korunur; model artık isteğe bağlıdır (yalnız ambalaj seçilebilir).

ALTER TABLE atolye_parca_modeli RENAME TO atolye_kalem_gorunumu;
ALTER TABLE atolye_kalem_gorunumu RENAME COLUMN parca_anahtari TO kod_anahtari;
ALTER TABLE atolye_kalem_gorunumu RENAME COLUMN parca_no TO kod;
ALTER TABLE atolye_kalem_gorunumu RENAME CONSTRAINT atolye_parca_modeli_pkey TO atolye_kalem_gorunumu_pkey;
ALTER TABLE atolye_kalem_gorunumu RENAME CONSTRAINT atolye_parca_modeli_no TO atolye_kalem_gorunumu_kod;
ALTER TABLE atolye_kalem_gorunumu RENAME CONSTRAINT atolye_parca_modeli_anahtari TO atolye_kalem_gorunumu_anahtari;
ALTER TABLE atolye_kalem_gorunumu RENAME CONSTRAINT atolye_parca_modeli_model_id_fkey TO atolye_kalem_gorunumu_model_id_fkey;
ALTER TABLE atolye_kalem_gorunumu RENAME CONSTRAINT atolye_parca_modeli_kaydeden_kisi_id_fkey TO atolye_kalem_gorunumu_kaydeden_kisi_id_fkey;
ALTER INDEX atolye_parca_modeli_model RENAME TO atolye_kalem_gorunumu_model;

ALTER TABLE atolye_kalem_gorunumu ALTER COLUMN model_id DROP NOT NULL;
-- Ambalaj: rafta paketli gösterimde yükün biçimi; otomatik ise malzemenin biçiminden (sac, çubuk, parça) seçilir.
ALTER TABLE atolye_kalem_gorunumu ADD COLUMN ambalaj text NOT NULL DEFAULT 'otomatik'
  CONSTRAINT atolye_kalem_gorunumu_ambalaj CHECK (ambalaj IN ('otomatik', 'koli', 'kasa', 'kutu', 'demet', 'levha'));
-- Rafta: paket (ambalajıyla) ya da model (parçanın kendi 3B modeli, gerçek ölçüsüyle dizilir).
ALTER TABLE atolye_kalem_gorunumu ADD COLUMN rafta text NOT NULL DEFAULT 'paket'
  CONSTRAINT atolye_kalem_gorunumu_rafta CHECK (rafta IN ('paket', 'model'));
ALTER TABLE atolye_kalem_gorunumu ADD CONSTRAINT atolye_kalem_gorunumu_model CHECK (rafta = 'paket' OR model_id IS NOT NULL);
-- Hiçbir şey seçilmemiş satır anlamsızdır (görünüm kaldırılır).
ALTER TABLE atolye_kalem_gorunumu ADD CONSTRAINT atolye_kalem_gorunumu_bos CHECK (model_id IS NOT NULL OR ambalaj <> 'otomatik');

-- Kaleme yalnız yüklemesi tamamlanmış model bağlanır; model verilmemişse denetim yok.
DROP TRIGGER atolye_parca_modeli_tamam ON atolye_kalem_gorunumu;
DROP FUNCTION atolye_parca_modeli_tamam();
CREATE FUNCTION atolye_kalem_gorunumu_tamam() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.model_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atolye_model WHERE id = NEW.model_id AND tamam) THEN
    RAISE EXCEPTION 'Modelin yüklemesi tamamlanmamış' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_kalem_gorunumu_tamam';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_kalem_gorunumu_tamam BEFORE INSERT OR UPDATE OF model_id ON atolye_kalem_gorunumu
  FOR EACH ROW EXECUTE FUNCTION atolye_kalem_gorunumu_tamam();
