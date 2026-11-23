-- 3593 (3572 a dilim 2 devri): talep kaleminde işaretlenen alternatif kartları. Ad, tür ve özet işaretlendiği andaki hâlidir: kart sonradan
-- değişse ya da kaldırılsa da talep ve gönderilmiş form işaretlendiği gibi kalır (set_id boşalır). Yeni tablo; var olan veri değişmez.
CREATE TABLE satin_alma_talep_kalemi_alternatif_karti (
  talep_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  sira smallint NOT NULL CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_sira CHECK (sira BETWEEN 1 AND 20),
  set_id int CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_set REFERENCES malzeme_alternatif_seti (id) ON DELETE SET NULL,
  ad text NOT NULL CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_ad CHECK (btrim(ad) <> '' AND length(ad) <= 80),
  tur text NOT NULL CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_tur CHECK (tur IN ('tam', 'ust', 'sartli')),
  ozet text NOT NULL CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_ozet CHECK (length(ozet) <= 1000),
  PRIMARY KEY (talep_id, kalem_id, sira),
  CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_tek UNIQUE (talep_id, kalem_id, set_id),
  CONSTRAINT satin_alma_talep_kalemi_alternatif_karti_kalem FOREIGN KEY (talep_id, kalem_id)
    REFERENCES satin_alma_talep_kalemi (talep_id, id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX satin_alma_talep_kalemi_alternatif_karti_set_dizini ON satin_alma_talep_kalemi_alternatif_karti (set_id) WHERE set_id IS NOT NULL;
