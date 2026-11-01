-- İlk tur etiketleri (kart 1525; 1285 a, 1530 a): baskı defteri ilk turun üç kayıt türünü de kabul eder; kalite durumu ve sevk
-- kolisi kodları gelince kısıt yeniden açılmaz. Defterdeki satırlar değişmez, liste yalnız genişler.
ALTER TABLE etiket_merkezi_baski_kaydi DROP CONSTRAINT etiket_merkezi_baski_kaydi_tur,
  ADD CONSTRAINT etiket_merkezi_baski_kaydi_tur CHECK (kaynak_tur IN (
    'konum', 'raf', 'lot', 'istasyon', 'refakat', 'malzeme', 'kalite-durum', 'hatali-parca', 'sevk-koli'));

-- Hatalı parça etiketi artık Etiket Merkezi'nden basılır. Katalog satırıdır, gerçek veri değildir; yalnız bu satır değişir.
UPDATE etiket_merkezi_etiket_turu
   SET durum = 'hazir', sablon_turu = 'hatali-parca', kayit_turleri = '{hatali-parca}'
 WHERE kod = 'hatali-parca';
