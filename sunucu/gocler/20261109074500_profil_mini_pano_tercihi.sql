-- Kişinin mini pano seçimi (2425-3 a): seçim kişiye bağlıdır, tema gibi her cihazda geçerlidir.
-- Kapatılan panolar tutulur, açılanlar değil: modül sonradan yeni pano bildirince kişide kendiliğinden açık gelir; kaydı
-- olmayan kişide hepsi açıktır. Sürüm aynı kişinin iki ekranından gelen yazmayı ayırır.
CREATE TABLE profil_mini_pano_tercihi (
  kisi_id int PRIMARY KEY CONSTRAINT profil_mini_pano_tercihi_kisi_fk REFERENCES kisi,
  kapali text[] NOT NULL DEFAULT '{}' CONSTRAINT profil_mini_pano_tercihi_kapali_sinir CHECK (cardinality(kapali) <= 50),
  acilista_oner boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1 CONSTRAINT profil_mini_pano_tercihi_surum_gecerli CHECK (surum > 0),
  guncellendi timestamptz NOT NULL DEFAULT now()
);
