-- 249 a: katalog kalemi kodunu, adını ve birimini bağlı malzeme kartından okur; kopyalar kart değişince eskir. Kategori kalır:
-- kartta kategori yalnız sarf, demirbaş ve hizmette vardır, hammadde ve mamulde karşılığı yoktur.
ALTER TABLE satin_alma_katalog DROP COLUMN kod, DROP COLUMN ad, DROP COLUMN birim;
