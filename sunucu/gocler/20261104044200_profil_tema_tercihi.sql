-- Kişinin seçtiği görünüm teması (karar 2072 a): tema tarayıcıya değil kişiye bağlıdır, ortak terminalde giren kişiyle gelir.
-- Kaydı olmayan kişi cihazın son temasını görür; sürüm aynı kişinin iki ekranından gelen yazmayı ayırır.
CREATE TABLE profil_tema_tercihi (
  kisi_id int PRIMARY KEY CONSTRAINT profil_tema_tercihi_kisi_fk REFERENCES kisi,
  tema text NOT NULL CONSTRAINT profil_tema_tercihi_tema_gecerli CHECK (tema IN ('light', 'dark', 'kontrast', 'gun')),
  surum int NOT NULL DEFAULT 1 CONSTRAINT profil_tema_tercihi_surum_gecerli CHECK (surum > 0),
  guncellendi timestamptz NOT NULL DEFAULT now()
);
