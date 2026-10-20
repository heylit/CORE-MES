-- Rotasız emir (B13, kullanıcı kararı 14.10.2026): malzemeli emir rota seçmeden açılır, adımları sonradan eklenir. "Rota varsa malzeme
-- vardır" kalır; "malzeme varsa rota vardır" kalkar. Kısıt yalnız gevşer, hiçbir satır değişmez.
ALTER TABLE uretim_emri DROP CONSTRAINT uretim_emri_rotali;
ALTER TABLE uretim_emri ADD CONSTRAINT uretim_emri_rota_malzemeli CHECK (kaynak_rota_revizyonu_id IS NULL OR malzeme_no IS NOT NULL);
