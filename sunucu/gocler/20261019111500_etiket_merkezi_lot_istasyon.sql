-- Lot ve istasyon etiketleri de gerçek kayıttan basılır; yalnız basılan kayıt türü listesi genişler.
ALTER TABLE etiket_merkezi_baski_kaydi DROP CONSTRAINT etiket_merkezi_baski_kaydi_tur,
  ADD CONSTRAINT etiket_merkezi_baski_kaydi_tur CHECK (kaynak_tur IN ('konum', 'lot', 'istasyon'));
