-- 3419 a: fiyatı verilmiş ama siparişe dönmemiş teklif silinmez, arşivlenir; arşiv durumdan ayrı alandır, geri alınır. Boş olabilen sütunlar; veri değişmez.
ALTER TABLE siparisler_teklif
  ADD COLUMN arsiv_an timestamptz,
  ADD COLUMN arsivleyen_id int CONSTRAINT siparisler_teklif_arsivleyen REFERENCES kisi (id),
  ADD COLUMN arsiv_nedeni text CONSTRAINT siparisler_teklif_arsiv_nedeni CHECK (arsiv_nedeni IN ('tekrar', 'yanlis-firma', 'deneme', 'diger')),
  ADD COLUMN arsiv_notu text CONSTRAINT siparisler_teklif_arsiv_notu CHECK (btrim(arsiv_notu) = arsiv_notu AND length(arsiv_notu) BETWEEN 1 AND 500),
  ADD CONSTRAINT siparisler_teklif_arsiv_butun CHECK (
    (arsiv_an IS NULL) = (arsivleyen_id IS NULL) AND (arsiv_an IS NULL) = (arsiv_nedeni IS NULL) AND (arsiv_notu IS NULL OR arsiv_an IS NOT NULL)
  ),
  -- Fiyatı verilmemiş teklif silinir; kabul edilen ve siparişe dönen teklif kapanmaz.
  ADD CONSTRAINT siparisler_teklif_arsiv_durum CHECK (arsiv_an IS NULL OR durum IN ('onay-bekliyor', 'verildi', 'revizyon', 'red'));
