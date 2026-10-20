-- 236 a: defteri sunucu işi yazar; kişi yoktur. Boş donduran = sunucu yazdı.
ALTER TABLE proje_maliyet_defteri ALTER COLUMN donduran_id DROP NOT NULL;
