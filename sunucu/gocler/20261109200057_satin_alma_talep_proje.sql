-- 2611 a: üretim emrine bağlı olmayan talep bir projeye bağlanabilir; alımın bedeli proje maliyetine buradan gider. Emirli talebin projesi
-- emirden gelir; ikisi birlikte olursa aynı alım iki yoldan sayılırdı.
ALTER TABLE satin_alma_talep ADD COLUMN proje_id int CONSTRAINT satin_alma_talep_proje REFERENCES projeler_proje (id);
ALTER TABLE satin_alma_talep ADD CONSTRAINT satin_alma_talep_proje_emirsiz CHECK (proje_id IS NULL OR uretim_emri_id IS NULL);
CREATE INDEX satin_alma_talep_proje_sirasi ON satin_alma_talep (proje_id) WHERE proje_id IS NOT NULL;

-- 2614 1/2 a: İdari İşler talebinden açılan satın alma talebi; bir idari talep bir kez çevrilir.
ALTER TABLE satin_alma_talep ADD COLUMN idari_talep_id int CONSTRAINT satin_alma_talep_idari_talep REFERENCES idari_isler_talep (id);
CREATE UNIQUE INDEX satin_alma_talep_idari_talep_tek ON satin_alma_talep (idari_talep_id) WHERE idari_talep_id IS NOT NULL;
