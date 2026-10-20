-- Rota adımı açılırken katalogdan öneri alır (RT2 a: istasyonlar kataloğu esas; IR1 a). Dört sütun da boş olabilir:
-- 96 tohum satırı değişmez, boş "bilinmiyor" demektir; sıfır uydurulmaz. Sıra sütunu yok (IR3 b): katalog koda göre sıralı kalır.
ALTER TABLE istasyonlar_operasyon_tipi
  ADD COLUMN kisaltma text CONSTRAINT istasyonlar_operasyon_tipi_kisaltma_bicimi CHECK (kisaltma ~ '^[A-ZÇĞİÖŞÜ0-9]{1,6}$'),
  ADD COLUMN varsayilan_ayar_dk numeric(8,2) CONSTRAINT istasyonlar_operasyon_tipi_ayar_negatif_degil CHECK (varsayilan_ayar_dk >= 0),
  ADD COLUMN varsayilan_birim_dk numeric(10,4) CONSTRAINT istasyonlar_operasyon_tipi_birim_negatif_degil CHECK (varsayilan_birim_dk >= 0),
  ADD COLUMN varsayilan_istasyon_id int REFERENCES istasyon;
CREATE INDEX istasyonlar_operasyon_tipi_istasyon_idx ON istasyonlar_operasyon_tipi (varsayilan_istasyon_id);
