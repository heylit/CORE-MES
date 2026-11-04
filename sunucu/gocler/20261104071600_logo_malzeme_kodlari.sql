-- Logo'daki malzeme kartı kodlarının aynası (karar 2089-2 a): malzemeler yeni stok kodu verirken Logo'da kullanılan numarayı atlar.
-- Liste köprüden saatte bir okunur; TMI'nin açtığı kart kodu açılır açılmaz eklenir. Logo'ya yazmaz, yalnız okunur.
CREATE TABLE logo_malzeme_kodu (
  kod text PRIMARY KEY CONSTRAINT logo_malzeme_kodu_kod CHECK (btrim(kod) <> '' AND length(kod) <= 64),
  son_okuma timestamptz NOT NULL
);

ALTER TABLE logo_liste_okuma DROP CONSTRAINT logo_liste_okuma_liste;
ALTER TABLE logo_liste_okuma ADD CONSTRAINT logo_liste_okuma_liste CHECK (liste IN ('cari', 'ambar', 'malzeme'));
