-- 3429-3 F (kart 3429 a): kalem nasıl karşılanır; onayda yalnız "uret" kalemi emir açar, stok ve satın alma yolu kendi isteğini açar.
-- Eski satırlar varsayılanla "uret" olur (bugünkü davranış); veri dönüştürülmez.
ALTER TABLE siparisler_siparis_satiri
  ADD COLUMN karsilama text NOT NULL DEFAULT 'uret' CONSTRAINT siparisler_siparis_satiri_karsilama CHECK (karsilama IN ('uret', 'stok', 'satin-al'));
