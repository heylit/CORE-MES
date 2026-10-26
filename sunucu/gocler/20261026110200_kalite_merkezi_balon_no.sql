-- Balon numarası yalnız resmin etkin balonları arasında tekildir (603 a): kaldırılan balon ölçümleriyle kalır, numarası yeni balona
-- verilebilir. Plan bütün olarak yazılır ve numaralar yer değiştirebilir (1 ile 2): denetim transaction sonunda yapılır.
-- Tablo 20261026074100 ile boş açıldı; satır değişmez.
ALTER TABLE kalite_merkezi_balon DROP CONSTRAINT kalite_merkezi_balon_no_tekil;
ALTER TABLE kalite_merkezi_balon ADD CONSTRAINT kalite_merkezi_balon_no_tekil
  EXCLUDE USING btree (resim_id WITH =, no WITH =) WHERE (aktif) DEFERRABLE INITIALLY DEFERRED;
