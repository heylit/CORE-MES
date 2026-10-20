-- Dosya yazıcısına (Argox USB) inen komut dosyası da baskı defterine yazılır; yalnız sonuç listesi genişler.
ALTER TABLE etiket_merkezi_baski DROP CONSTRAINT etiket_merkezi_baski_sonuc,
  ADD CONSTRAINT etiket_merkezi_baski_sonuc CHECK (sonuc IN ('gonderildi', 'hata', 'indirildi'));
