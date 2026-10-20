-- 278 a: emrin kaynak rota revizyonu veritabanında da denetlenir; olmayan revizyon yazılamaz.
-- Bozuk kayıt varsa göç durur: kayıtlar silinmez, kullanıcıya sorulur.
DO $$
DECLARE
  bozuk int;
BEGIN
  SELECT count(*) INTO bozuk FROM uretim_emri e
   WHERE e.kaynak_rota_revizyonu_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rota_revizyonu r WHERE r.id = e.kaynak_rota_revizyonu_id);
  IF bozuk > 0 THEN
    RAISE EXCEPTION 'uretim_emri: % emrin kaynak rota revizyonu yok; göç durdu, kayıtlar için karar gerekir.', bozuk;
  END IF;
END $$;
ALTER TABLE uretim_emri
  ADD CONSTRAINT uretim_emri_kaynak_rota_revizyonu FOREIGN KEY (kaynak_rota_revizyonu_id) REFERENCES rota_revizyonu (id);
CREATE INDEX uretim_emri_kaynak_rota_revizyonu_idx ON uretim_emri (kaynak_rota_revizyonu_id);
