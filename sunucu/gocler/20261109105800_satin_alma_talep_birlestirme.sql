-- 2414 a: satın alma talepleri birleştirilir. Birleşen talep yeni taleptir; kaynak taleplerin kalemleri ona taşınır ve her kalem kaynağını,
-- kaynaktaki sırasını, kaynağın ihtiyaç tarihini ve birimini taşır (V4 a: harcama kalem birimine, yoksa talep birimine). Kaynak talep yerinde
-- kalır, birleşen talebi gösterir. Ayırmada kalemler kaynağına döner. Yeni sütunlar boştur; var olan satır değişmez.
ALTER TABLE satin_alma_talep ADD COLUMN birlesen_talep_id uuid CONSTRAINT satin_alma_talep_birlesen REFERENCES satin_alma_talep (id) ON DELETE RESTRICT,
  ADD CONSTRAINT satin_alma_talep_birlesen_kendisi_degil CHECK (birlesen_talep_id IS DISTINCT FROM id);
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN kaynak_talep_id uuid CONSTRAINT satin_alma_talep_kalemi_kaynak REFERENCES satin_alma_talep (id) ON DELETE RESTRICT,
  ADD COLUMN kaynak_sira smallint,
  ADD COLUMN kaynak_ihtiyac_tarihi date,
  ADD COLUMN kaynak_birim text CONSTRAINT satin_alma_talep_kalemi_kaynak_birim CHECK (kaynak_birim IS NULL OR (btrim(kaynak_birim) <> '' AND length(kaynak_birim) <= 60)),
  ADD CONSTRAINT satin_alma_talep_kalemi_kaynak_butun CHECK ((kaynak_talep_id IS NULL) = (kaynak_sira IS NULL)
    AND (kaynak_talep_id IS NOT NULL OR (kaynak_ihtiyac_tarihi IS NULL AND kaynak_birim IS NULL)));
CREATE INDEX satin_alma_talep_birlesen_dizini ON satin_alma_talep (birlesen_talep_id) WHERE birlesen_talep_id IS NOT NULL;
CREATE INDEX satin_alma_talep_kalemi_kaynak_dizini ON satin_alma_talep_kalemi (kaynak_talep_id) WHERE kaynak_talep_id IS NOT NULL;
