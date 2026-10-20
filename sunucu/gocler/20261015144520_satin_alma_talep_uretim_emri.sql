-- Talep bir üretim emri için açılabilir: o emre alınan malzeme mal kabulde emre ayrılır. Boş: emre bağlı değil (eski talepler dahil).
ALTER TABLE satin_alma_talep ADD COLUMN uretim_emri_id int REFERENCES uretim_emri;
