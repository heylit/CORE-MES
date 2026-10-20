-- Fason rota adımıdır (FS1 a): adımın kaynağı makine, kişi ya da finansın fason firması olur; fason adımda süre yerine termin
-- günü (takvim günü, FS4 a) tutulur. Sütunlar boş olabilir, var olan satır değişmez. Yeni kısıtları bozacak satır varsa göç hiçbir
-- şeyi değiştirmeden durur. Hizmet kartı sütunu malzemelerde hizmet türü gelince ayrı göçle gelir (F4).
DO $$
DECLARE
  adet int;
BEGIN
  SELECT count(*) INTO adet FROM rota_adimi WHERE makine_id IS NOT NULL AND kisi_id IS NOT NULL;
  IF adet > 0 THEN
    RAISE EXCEPTION 'Rota adımlarından % tanesinde hem makine hem kişi var; göç durdu, hiçbir şey değişmedi.', adet;
  END IF;
END $$;

ALTER TABLE rota_adimi
  ADD COLUMN fason_firma_id int REFERENCES finans_firma (id),
  ADD COLUMN termin_gun int CONSTRAINT rota_adimi_termin_gun CHECK (termin_gun BETWEEN 1 AND 365),
  DROP CONSTRAINT rota_adimi_tek_kaynak,
  ADD CONSTRAINT rota_adimi_tek_kaynak CHECK (num_nonnulls(makine_id, kisi_id, fason_firma_id) <= 1),
  -- Termin yalnız fason adımdadır; fason adımın dakika süresi yoktur (rota toplamına girmez).
  ADD CONSTRAINT rota_adimi_termin_fasonda CHECK (termin_gun IS NULL OR fason_firma_id IS NOT NULL),
  ADD CONSTRAINT rota_adimi_fason_suresiz CHECK (fason_firma_id IS NULL OR (ayar_suresi_dk IS NULL AND birim_sure_dk IS NULL));
