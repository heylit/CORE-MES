-- 2876 (2871-1 b, 2871-2 a): teklif toplanırken talep eden asıl talebi bozmadan güncelleme talebi açar; güncelleme kök talebe bağlanır
-- (zincir yok: güncellemenin güncellemesi de köke). Biri siparişe geçince gruptaki öteki açık talepler iptal olur. Var olan satır değişmez.
ALTER TABLE satin_alma_talep ADD COLUMN guncellenen_talep_id uuid
  CONSTRAINT satin_alma_talep_guncellenen REFERENCES satin_alma_talep (id) ON DELETE RESTRICT;
ALTER TABLE satin_alma_talep ADD CONSTRAINT satin_alma_talep_guncellenen_kendisi_degil CHECK (guncellenen_talep_id IS NULL OR guncellenen_talep_id <> id);
CREATE INDEX satin_alma_talep_guncellenen_sirasi ON satin_alma_talep (guncellenen_talep_id) WHERE guncellenen_talep_id IS NOT NULL;
