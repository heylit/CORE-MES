-- 3425 a: iptal edilen satış siparişi arşive kalkar; kayıt silinmez, geri alınır. Boş olabilen sütunlar; veri değişmez.
ALTER TABLE siparisler_siparis
  ADD COLUMN arsiv_an timestamptz,
  ADD COLUMN arsivleyen_id int CONSTRAINT siparisler_siparis_arsivleyen REFERENCES kisi (id),
  ADD CONSTRAINT siparisler_siparis_arsiv_butun CHECK ((arsiv_an IS NULL) = (arsivleyen_id IS NULL)),
  -- Yalnız iptal edilmiş sipariş arşive kalkar; açık ve tamamlanan sipariş listede kalır.
  ADD CONSTRAINT siparisler_siparis_arsiv_durum CHECK (arsiv_an IS NULL OR durum = 'iptal');
