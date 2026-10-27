-- 818 B4: İş emri silinirken PostgreSQL yabancı anahtarı denetlemek için alt tabloyu tarar; ön dizin taramayı önler.
-- Boş olabilen sütunda dizin yalnız dolu satırları tutar; silme denetimi (sütun = değer) bu dizini kullanır.
CREATE INDEX satin_alma_siparis_satiri_is_emri_fk_idx ON satin_alma_siparis_satiri (is_emri_id) WHERE is_emri_id IS NOT NULL;
