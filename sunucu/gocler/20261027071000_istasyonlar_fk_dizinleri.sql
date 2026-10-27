-- 818 B4: İstasyon ve makine silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX istasyonlar_kod_gecmisi_istasyon_fk_idx ON istasyonlar_kod_gecmisi (istasyon_id) WHERE istasyon_id IS NOT NULL;
CREATE INDEX istasyonlar_kod_gecmisi_makine_fk_idx ON istasyonlar_kod_gecmisi (makine_id) WHERE makine_id IS NOT NULL;
CREATE INDEX istasyonlar_yetkinlik_istasyon_fk_idx ON istasyonlar_yetkinlik (istasyon_id);
