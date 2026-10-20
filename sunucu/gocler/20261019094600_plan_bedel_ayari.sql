-- Plan bedel ayarı (209 a, kurgu §7): gecikme bedelinin tabanı, finansman ve kâr riski oranları (%/gün) ve öncelik sınıfı eşikleri koddan
-- canlı plan ayarına taşınır. Yalnız sütun eklenir; varsayılanlar kodun bugünkü değerleridir (196 a, 194 a, 195 a). Finansman oranı boş başlar:
-- oran verilmeden finansman bedele girmez.
ALTER TABLE plan_ayari
  ADD COLUMN taban_bedel_saat numeric(10, 2) NOT NULL DEFAULT 150 CONSTRAINT plan_ayari_taban_bedel CHECK (taban_bedel_saat > 0),
  ADD COLUMN finansman_orani_gun numeric(6, 4) CONSTRAINT plan_ayari_finansman CHECK (finansman_orani_gun BETWEEN 0 AND 5),
  ADD COLUMN kar_riski_orani_gun numeric(6, 4) NOT NULL DEFAULT 0.3 CONSTRAINT plan_ayari_kar_riski CHECK (kar_riski_orani_gun BETWEEN 0 AND 5),
  ADD COLUMN yuksek_esigi numeric(4, 2) NOT NULL DEFAULT 1.5 CONSTRAINT plan_ayari_yuksek_esigi CHECK (yuksek_esigi > 1),
  ADD COLUMN dusuk_esigi numeric(4, 2) NOT NULL DEFAULT 0.6 CONSTRAINT plan_ayari_dusuk_esigi CHECK (dusuk_esigi > 0 AND dusuk_esigi < 1);
