-- 1995 a: eski revizyonun kontrol planı yeni revizyona kopyalanınca balonların yeri yeni resimde kontrol bekler. İşaret balonun yeri
-- yazılınca ya da plan kaydedilince kalkar. Var olan satırlar işaretsizdir, veri değişmez.
ALTER TABLE kalite_merkezi_balon ADD COLUMN yer_kontrol boolean NOT NULL DEFAULT false;
