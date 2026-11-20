-- 3462 a: talep kalemi kendi termini ve üretim emriyle açılabilir. Boş: talebin termini ve emri geçerlidir (eski kalemler dahil, değer yazılmaz).
-- Kalem yalnız talepten farklıysa dolu yazılır; talebin termini kalemlerin en erkeni, emri yalnız ortaksa doludur (servis türetir).
ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN ihtiyac_tarihi date,
  ADD COLUMN uretim_emri_id int CONSTRAINT satin_alma_talep_kalemi_uretim_emri REFERENCES uretim_emri;
CREATE INDEX satin_alma_talep_kalemi_uretim_emri_dizini ON satin_alma_talep_kalemi (uretim_emri_id) WHERE uretim_emri_id IS NOT NULL;
