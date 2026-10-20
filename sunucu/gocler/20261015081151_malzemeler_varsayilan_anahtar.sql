-- Çakışma kontrolü tür ayarına bağlandı (kullanıcı kartı "Uyarı ve engel" ve yazılı onay, 15.10.2026): türde çakışma alanı seçiliyse
-- benzersiz anahtarı sunucu o alanlardan kurar. Ekranın kendi kuralıyla kurduğu anahtar ayrı tutulur ki ayar boşalınca kartlar ona dönebilsin.
ALTER TABLE malzeme_katalog_karti ADD COLUMN varsayilan_anahtar text
  CONSTRAINT malzeme_katalog_karti_varsayilan_anahtar_dolu CHECK (varsayilan_anahtar IS NULL OR btrim(varsayilan_anahtar) <> '');

-- Bugün bütün kartlar varsayılan kuraldadır: varsayılan anahtar kayıtlı anahtarın aynısıdır. Kayıtlı anahtar değişmez.
UPDATE malzeme_katalog_karti SET varsayilan_anahtar = benzersiz_anahtar WHERE benzersiz_anahtar IS NOT NULL;
