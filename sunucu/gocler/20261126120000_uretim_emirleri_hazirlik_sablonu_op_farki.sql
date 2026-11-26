-- 3741: emre özel hazırlık farkı operasyon (iş emri) düzeyine inebilir. Yalnız boş olabilen sütun eklenir; var olan satırlar emir düzeyinde (NULL) kalır,
-- veri dönüştürülmez. Geçerli hal önceliği: OP farkı > emir farkı > tür şablonu.
-- Yabancı anahtar BİLEREK yok: defter yalnız eklenir, FK olsaydı fark almış bekleyen OP silinemezdi (23503). İş emrinin emre ait olması servis kuralıdır, kısıt yok;
-- okuma iş emriyle süzülür (var olan iş emirlerine bakılır), silinen OP'nin satırı okunmaz.
ALTER TABLE uretim_emirleri_hazirlik_sablonu_ozel ADD COLUMN is_emri_id int;
CREATE INDEX uretim_emirleri_hazirlik_sablonu_ozel_is_emri_idx ON uretim_emirleri_hazirlik_sablonu_ozel (is_emri_id, madde, id) WHERE is_emri_id IS NOT NULL;
-- Geri alma: sütun ve dizin kaldırılabilir (OP farkı satırları kaybolur; emir düzeyi satırlara dokunulmaz).
