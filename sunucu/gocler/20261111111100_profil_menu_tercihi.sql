-- Kişinin sık kullanılan sayfaları (2951): menünün en üstünde kişinin seçtiği sırayla durur. Seçim kişiye bağlıdır, terminal
-- birden çok kişiye açık olduğu için tarayıcıda tutulmaz. Yetki değildir: menü yalnız kişinin açabildiği sayfaları çizer.
-- Sayfa sınırı sözleşmedeki MENU_SIK_SINIRI ile aynıdır; sürüm aynı kişinin iki ekranından gelen yazmayı ayırır.
CREATE TABLE profil_menu_tercihi (
  kisi_id int PRIMARY KEY CONSTRAINT profil_menu_tercihi_kisi_fk REFERENCES kisi,
  sayfalar text[] NOT NULL DEFAULT '{}' CONSTRAINT profil_menu_tercihi_sayfalar_sinir CHECK (cardinality(sayfalar) <= 10),
  surum int NOT NULL DEFAULT 1 CONSTRAINT profil_menu_tercihi_surum_gecerli CHECK (surum > 0),
  guncellendi timestamptz NOT NULL DEFAULT now()
);
