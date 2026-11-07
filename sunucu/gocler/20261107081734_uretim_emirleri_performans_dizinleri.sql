-- Kart 2216 (2202 ölçümü, İP-3 ve İP-6): yalnız dizin eklenir, veri ve kısıt değişmez.
-- Parti ağacı (`ust_emir_id = ANY`, özyinelemeli ağaç) ve "partili mi" denetimi üst emirden alt emre gider; dizin yokken her
-- çağrı emir tablosunu baştan sona tarıyor ve şişen maliyet tahmini kısa sorguyu ağır gösteriyordu. Sütunların çoğu boş: kısmi dizin.
CREATE INDEX uretim_emri_ust_emir_idx ON uretim_emri (ust_emir_id) WHERE ust_emir_id IS NOT NULL;
CREATE INDEX uretim_emri_birlestigi_emir_idx ON uretim_emri (birlestigi_emir_id) WHERE birlestigi_emir_id IS NOT NULL;

-- Son olaylar akışı (atölye haritası ve dijital ikiz yoklar) her defterden en yeni satırları okur: zaman sırası dizinden gelir.
CREATE INDEX uretim_kaydi_zaman_idx ON uretim_kaydi (zaman);
CREATE INDEX uretim_olayi_zaman_idx ON uretim_olayi (zaman);
CREATE INDEX uretim_sayimi_an_idx ON uretim_sayimi ((COALESCE(karar_zamani, zaman))) WHERE tur IN ('saglam', 'hurda', 'red');
