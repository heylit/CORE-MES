-- Logo'daki siparişin teslim alınmamış kalanı kapatılır (#205 S2 b, "Kalanı kapat"). Kapatılan siparişe yeni teslim yazılmaz;
-- durum boşsa sipariş açıktır. Var olan siparişler değişmez.
ALTER TABLE satin_alma_siparis
  ADD COLUMN logo_kapatma_durumu text CONSTRAINT satin_alma_siparis_logo_kapatma_durumu CHECK (logo_kapatma_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_kapatma_hata text CONSTRAINT satin_alma_siparis_logo_kapatma_hata CHECK (logo_kapatma_hata IS NULL OR (btrim(logo_kapatma_hata) <> '' AND length(logo_kapatma_hata) <= 2000)),
  ADD CONSTRAINT satin_alma_siparis_logo_kapatma_butun CHECK (
    (logo_kapatma_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_kapatma_hata IS NOT NULL) = (logo_kapatma_durumu IS NOT DISTINCT FROM 'hata')
  );

CREATE INDEX satin_alma_siparis_logo_kapatma_kuyrugu ON satin_alma_siparis (id) WHERE logo_kapatma_durumu IN ('bekliyor', 'hata');
