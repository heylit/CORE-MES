-- 818 B4: İstasyon, makine ve iş emri silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX uretim_emirleri_emir_adimi_is_emri_fk_idx ON emir_adimi (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX uretim_emirleri_arsiv_istasyon_fk_idx ON uretim_emirleri_arsiv (istasyon_id);
CREATE INDEX uretim_emirleri_hazirlik_muafiyeti_is_emri_fk_idx ON uretim_emirleri_hazirlik_muafiyeti (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX uretim_emirleri_is_emri_makine_fk_idx ON uretim_emirleri_is_emri (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX uretim_emirleri_is_emri_adayi_makine_fk_idx ON uretim_emirleri_is_emri_adayi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX uretim_emirleri_katilim_istasyon_fk_idx ON uretim_emirleri_katilim (istasyon_id);
CREATE INDEX uretim_emirleri_makine_kullanimi_is_emri_fk_idx ON uretim_emirleri_makine_kullanimi (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX uretim_emirleri_uretim_yeri_degisimi_eski_istasyon_fk_idx ON uretim_emirleri_uretim_yeri_degisimi (eski_istasyon_id) WHERE eski_istasyon_id IS NOT NULL;
CREATE INDEX uretim_emirleri_uretim_yeri_degisimi_eski_makine_fk_idx ON uretim_emirleri_uretim_yeri_degisimi (eski_makine_id) WHERE eski_makine_id IS NOT NULL;
CREATE INDEX uretim_emirleri_uretim_kaydi_is_emri_fk_idx ON uretim_kaydi (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX uretim_emirleri_uretim_kaydi_istasyon_fk_idx ON uretim_kaydi (istasyon_id);
CREATE INDEX uretim_emirleri_uretim_olayi_istasyon_fk_idx ON uretim_olayi (istasyon_id);

-- 818 B5: aynı sütunlarda (uretim_emri_id, sira) tekil dizin var (uretim_emirleri_is_emri_sira_tekil); ertelenebilir olsa da
-- taramada kullanılır. Tekil olmayan ikizi her yazmada boşuna güncellenir.
DROP INDEX uretim_emirleri_is_emri_emir_idx;
