-- Logo birim seti listesi (kart #207, kullanıcı kararları LB6 c, LB11 a): köprüden okunan ve yönetici eliyle girilen kodlar.
-- Malzemelerin birim karşılığı bu listeden seçilir; listede olmayan karşılıklı kart gönderilmez.
CREATE TABLE logo_birim_seti (
  kod text PRIMARY KEY CONSTRAINT logo_birim_seti_kod CHECK (kod ~ '^\S+$' AND length(kod) <= 40),
  ad text CONSTRAINT logo_birim_seti_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 80)),
  elle boolean NOT NULL DEFAULT false,
  kopru_listesinde boolean NOT NULL DEFAULT false,
  -- Elle ekleyen; köprüden gelen satırda boş olabilir.
  ekleyen_kisi_id int REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logo_birim_seti_kaynak CHECK (elle OR kopru_listesinde),
  CONSTRAINT logo_birim_seti_ekleyen CHECK (NOT elle OR ekleyen_kisi_id IS NOT NULL)
);

-- Köprüden son liste okuması (tek satır). Satır yoksa liste hiç okunmamıştır: elle girilen kodlar geçerli sayılır.
CREATE TABLE logo_birim_seti_okuma (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT logo_birim_seti_okuma_tek CHECK (tek),
  son_okuma timestamptz NOT NULL,
  sayi int NOT NULL CONSTRAINT logo_birim_seti_okuma_sayi CHECK (sayi >= 0)
);
