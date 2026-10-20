-- Birleşen partinin hangi emre katıldığı (kart #262, kullanıcı kararı "Sutun eklensin" 2026-10-10): birleştirmede kaynak iptal olur ve
-- bu sütun hedefi tutar. Boş olabilen tek sütun eklenir, var olan satırlar değişmez.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM uretim_emri;
  RAISE NOTICE 'uretim_emri: % satır var; göç yalnız boş sütun ekler', satir;
END $$;

ALTER TABLE uretim_emri
  ADD COLUMN birlestigi_emir_id int CONSTRAINT uretim_emri_birlestigi_emir REFERENCES uretim_emri,
  ADD CONSTRAINT uretim_emri_birlesen_iptal CHECK (birlestigi_emir_id IS NULL OR (durum = 'iptal' AND birlestigi_emir_id <> id));
