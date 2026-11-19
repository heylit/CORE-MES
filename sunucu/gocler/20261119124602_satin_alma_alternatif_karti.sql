-- 3437 a (dilim 3b-2): karar onaylanınca seçilen alternatifin malzeme kartı açılır (ONAYDA) ya da aynı nitelikli kart bulunur.
--   satin_alma_teklif_satiri.alternatif_kart_no: teklif satırındaki alternatifin kartı (alternatif değişince servis boşaltır).
--   satin_alma_siparis_satiri.alternatif_malzeme_no: siparişin alternatif kartı; boş = kalemin (istenen) kartı.
-- Yalnız boş sütun eklenir; var olan satır değişmez.
ALTER TABLE satin_alma_teklif_satiri
  ADD COLUMN alternatif_kart_no int CONSTRAINT satin_alma_teklif_satiri_alternatif_kart REFERENCES malzeme_katalog_karti (no),
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_kartli CHECK (alternatif_kart_no IS NULL OR alternatif IS NOT NULL);
ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN alternatif_malzeme_no int CONSTRAINT satin_alma_siparis_satiri_alternatif_malzeme REFERENCES malzeme_katalog_karti (no);
