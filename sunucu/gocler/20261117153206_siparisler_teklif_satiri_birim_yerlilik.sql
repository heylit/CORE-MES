-- 3400-2, 3400-3: teklif kaleminin birimi (kartsız kalemde seçilir; karta bağlı kalemde boş kalır, kartın birimi okunur) ve
-- yerlilik oranı (talep kaydında karttan ya da kalemden yazılır). Boş olabilen sütunlar, yalnız ekleme: eski satırlar null kalır.
ALTER TABLE siparisler_teklif_satiri
  ADD COLUMN birim text CONSTRAINT siparisler_teklif_satiri_birim REFERENCES malzeme_birimi (kod),
  ADD COLUMN yerlilik_orani numeric(5,2)
    CONSTRAINT siparisler_teklif_satiri_yerlilik CHECK (yerlilik_orani IS NULL OR yerlilik_orani BETWEEN 0 AND 100);
