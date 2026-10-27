-- 818 B4: İstasyon silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX stok_malzeme_istegi_istasyon_fk_idx ON stok_malzeme_istegi (istasyon_id) WHERE istasyon_id IS NOT NULL;
