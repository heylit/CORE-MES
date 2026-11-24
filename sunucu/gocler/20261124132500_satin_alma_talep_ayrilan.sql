-- 3590 (P1): kararın bir kısmı onaya gidince kalan kalemler yeni talebe ayrılır; yeni talep ayrıldığı talebi taşır. Var olan satır değişmez.
ALTER TABLE satin_alma_talep ADD COLUMN ayrildigi_talep_id uuid
  CONSTRAINT satin_alma_talep_ayrildigi REFERENCES satin_alma_talep (id) ON DELETE RESTRICT;
ALTER TABLE satin_alma_talep ADD CONSTRAINT satin_alma_talep_ayrildigi_kendisi_degil CHECK (ayrildigi_talep_id IS NULL OR ayrildigi_talep_id <> id);
CREATE INDEX satin_alma_talep_ayrildigi_dizini ON satin_alma_talep (ayrildigi_talep_id) WHERE ayrildigi_talep_id IS NOT NULL;
