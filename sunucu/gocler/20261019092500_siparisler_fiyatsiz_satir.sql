-- 201 a: fiyatı yalnız fiyat görme yetkisi olan (müdür) girer; planlama ve muhasebe kalemi fiyatsız açar. Fiyatsız kalemli sipariş
-- onaylanamaz (servis denetler). Yalnız NOT NULL kalkar; negatif fiyat kısıtı kalır.
ALTER TABLE siparisler_siparis_satiri ALTER COLUMN birim_fiyat DROP NOT NULL;
