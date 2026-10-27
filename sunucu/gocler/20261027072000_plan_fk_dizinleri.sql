-- 818 B4: İstasyon ve makine silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX plan_senaryo_yerlesim_parcasi_elle_istasyon_fk_idx ON plan_senaryo_yerlesim_parcasi (elle_istasyon_id) WHERE elle_istasyon_id IS NOT NULL;
CREATE INDEX plan_senaryo_yerlesim_parcasi_makine_fk_idx ON plan_senaryo_yerlesim_parcasi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX plan_senaryo_yerlesimi_elle_istasyon_fk_idx ON plan_senaryo_yerlesimi (elle_istasyon_id) WHERE elle_istasyon_id IS NOT NULL;
CREATE INDEX plan_senaryo_yerlesimi_makine_fk_idx ON plan_senaryo_yerlesimi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX plan_yerlesim_parcasi_elle_istasyon_fk_idx ON plan_yerlesim_parcasi (elle_istasyon_id) WHERE elle_istasyon_id IS NOT NULL;
CREATE INDEX plan_yerlesim_parcasi_makine_fk_idx ON plan_yerlesim_parcasi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX plan_yerlesimi_elle_istasyon_fk_idx ON plan_yerlesimi (elle_istasyon_id) WHERE elle_istasyon_id IS NOT NULL;
