-- 3332-2 a (kullanıcı 16.11): teslim sipariş satırının biriminde yazılır; mal kabulün stok birimindeki miktarı yanında durur, fiyat stok
-- birimine bununla çevrilir. Boş sütun eski kayıtlarda iki birimin aynı olduğu (bugüne kadarki yazım) demektir; var olan satıra dokunulmaz.
ALTER TABLE satin_alma_teslim ADD COLUMN stok_miktar numeric(18,4)
  CONSTRAINT satin_alma_teslim_stok_miktar CHECK (stok_miktar IS NULL OR sign(stok_miktar) = sign(miktar));
