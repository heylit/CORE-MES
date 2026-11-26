-- 3741: emre özel hazırlık farkı operasyon (iş emri) düzeyine inebilir. Yalnız boş olabilen sütun eklenir; var olan satırlar emir düzeyinde (NULL) kalır,
-- veri dönüştürülmez. Geçerli hal önceliği: OP farkı > emir farkı > tür şablonu. İş emrinin emre ait olması servis kuralıdır (iki tabloyu bağlayan kısıt yok).
ALTER TABLE uretim_emirleri_hazirlik_sablonu_ozel
  ADD COLUMN is_emri_id int CONSTRAINT uretim_emirleri_hazirlik_sablonu_ozel_is_emri REFERENCES uretim_emirleri_is_emri (id);
CREATE INDEX uretim_emirleri_hazirlik_sablonu_ozel_is_emri_idx ON uretim_emirleri_hazirlik_sablonu_ozel (is_emri_id, madde, id) WHERE is_emri_id IS NOT NULL;
-- Geri alma: sütun ve dizin kaldırılabilir (OP farkı satırları kaybolur; emir düzeyi satırlara dokunulmaz).
