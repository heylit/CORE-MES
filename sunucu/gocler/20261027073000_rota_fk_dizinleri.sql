-- 818 B4: İstasyon, makine ve iş emri silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX rota_aday_kaynagi_istasyon_fk_idx ON rota_aday_kaynagi (istasyon_id) WHERE istasyon_id IS NOT NULL;
CREATE INDEX rota_aday_kaynagi_makine_fk_idx ON rota_aday_kaynagi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX rota_adimi_istasyon_fk_idx ON rota_adimi (istasyon_id) WHERE istasyon_id IS NOT NULL;
CREATE INDEX rota_adimi_makine_fk_idx ON rota_adimi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX rota_gerceklesen_sure_is_emri_fk_idx ON rota_gerceklesen_sure (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX rota_gerceklesen_sure_makine_fk_idx ON rota_gerceklesen_sure (makine_id) WHERE makine_id IS NOT NULL;
