-- Kg fiyatından birim fiyat ve stok değeri için kartın birim ağırlığı sunucuda gerekir (kullanıcı kararı 208 a ve yazılı göç onayı, 19.10.2026).
-- Ağırlık ekranın yoğunluk tablosuyla hesaplanır; sunucu hesabı yinelemez, kayıtta ekranın sonucunu saklar. Var olan kartlar ilk kayıtta dolar.
ALTER TABLE malzeme_katalog_karti
  ADD COLUMN birim_agirlik_kg numeric(14, 4) CONSTRAINT malzeme_katalog_karti_birim_agirlik_pozitif CHECK (birim_agirlik_kg IS NULL OR birim_agirlik_kg > 0),
  ADD COLUMN kalite_adi text CONSTRAINT malzeme_katalog_karti_kalite_adi_dolu CHECK (kalite_adi IS NULL OR btrim(kalite_adi) <> ''),
  ADD COLUMN form_adi text CONSTRAINT malzeme_katalog_karti_form_adi_dolu CHECK (form_adi IS NULL OR btrim(form_adi) <> ''),
  -- Talaşın satış değeri malzeme maliyetinden düşülür (214 a): talaş = kütük ağırlığı - parçanın net ağırlığı. Mamul ve yarı mamulde, kartın net ağırlık alanından.
  ADD COLUMN net_agirlik_kg numeric(14, 4) CONSTRAINT malzeme_katalog_karti_net_agirlik_pozitif CHECK (net_agirlik_kg IS NULL OR net_agirlik_kg > 0);

-- Net ağırlığı girilmiş var olan parça kartları beklemeden dolar; yalnız düz, pozitif sayı alınır (kural katalogNetAgirlikKg ile aynı).
UPDATE malzeme_katalog_karti
   SET net_agirlik_kg = round((kayit #>> '{g,net}')::numeric, 4)
 WHERE tur IN ('mamul', 'yarimamul') AND jsonb_typeof(kayit #> '{g,net}') = 'number'
   AND (kayit #>> '{g,net}')::numeric > 0 AND (kayit #>> '{g,net}')::numeric < 1e9 AND round((kayit #>> '{g,net}')::numeric, 4) > 0;
