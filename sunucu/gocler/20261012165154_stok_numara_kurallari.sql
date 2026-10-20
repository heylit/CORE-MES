-- Belge numaraları sunucuda "Numara kuralları" ayarından kurulur (kart #819); var olan numaralar değişmez:
-- DROP EXPRESSION hesaplanmış değeri satırda bırakır. Numarasız ekleme artık reddedilir; tekliği var olan *_no_tek korur.
ALTER TABLE stok_mal_kabul ALTER COLUMN no DROP EXPRESSION;
ALTER TABLE stok_mal_kabul ALTER COLUMN no SET NOT NULL;

ALTER TABLE stok_fis ALTER COLUMN no DROP EXPRESSION;
ALTER TABLE stok_fis ALTER COLUMN no SET NOT NULL;

ALTER TABLE stok_toplama ALTER COLUMN no DROP EXPRESSION;
ALTER TABLE stok_toplama ALTER COLUMN no SET NOT NULL;

ALTER TABLE stok_malzeme_istegi ALTER COLUMN no DROP EXPRESSION;
ALTER TABLE stok_malzeme_istegi ALTER COLUMN no SET NOT NULL;
