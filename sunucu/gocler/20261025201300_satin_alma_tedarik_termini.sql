-- 533 a: malzemenin tedarik termini satın almanındır; malzeme başına tek satır. Plan "olması gereken" tarihi hesaplar ve buraya
-- bildirir (gereken_tarih); satın alma termini girer, plan girildiği an onu kullanır. Termin boşsa malzeme termin bekler.
-- Malzeme kartına alan eklenmez. Yeni ve boş tablo; var olan tablo değişmez.
CREATE TABLE satin_alma_tedarik_termini (
  malzeme_no int PRIMARY KEY CONSTRAINT satin_alma_tedarik_termini_malzeme REFERENCES malzeme_katalog_karti (no),
  termin date,
  gereken_tarih date,
  aciklama text NOT NULL DEFAULT '' CONSTRAINT satin_alma_tedarik_termini_aciklama CHECK (length(aciklama) <= 200),
  surum integer NOT NULL DEFAULT 1,
  kisi_id int CONSTRAINT satin_alma_tedarik_termini_kisi REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX satin_alma_tedarik_termini_acik ON satin_alma_tedarik_termini (malzeme_no) WHERE termin IS NOT NULL OR gereken_tarih IS NOT NULL;
