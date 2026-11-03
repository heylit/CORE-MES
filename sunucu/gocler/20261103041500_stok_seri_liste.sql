-- Seri liste (1915, 1914 teyit): Okut panelinin Seri modunda ya da okuyucu hafızasından gelen kodlar kişinin taslak listesine sırayla
-- düşer; stok değişmez. Liste telefonda başlar, bilgisayarda düzeltilip bir işe verilir. Yalnız yeni tablolar; var olan veri değişmez.
CREATE TABLE stok_seri_liste (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL REFERENCES kisi,
  kaynak text NOT NULL CONSTRAINT stok_seri_liste_kaynak_degeri CHECK (kaynak IN ('okutma', 'hafiza')),
  acilis timestamptz NOT NULL DEFAULT now(),
  degisim timestamptz NOT NULL DEFAULT now(),
  kapanis timestamptz,
  CONSTRAINT stok_seri_liste_kapanis_sonra CHECK (kapanis IS NULL OR kapanis >= acilis)
);
CREATE INDEX stok_seri_liste_acik_idx ON stok_seri_liste (kisi_id, id) WHERE kapanis IS NULL;

-- Adet yalnız sayılan etikette (lot, malzeme) dolu; göz, raf, kart ve tanınmayan kodda boş. Satır işe verilince `islendi` dolar.
CREATE TABLE stok_seri_okutma (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  liste_id bigint NOT NULL REFERENCES stok_seri_liste,
  sira int NOT NULL CONSTRAINT stok_seri_okutma_sira_pozitif CHECK (sira > 0),
  kod text NOT NULL CONSTRAINT stok_seri_okutma_kod_bicimi CHECK (btrim(kod) <> '' AND length(kod) <= 200),
  adet numeric(14,3) CONSTRAINT stok_seri_okutma_adet_eksi_degil CHECK (adet IS NULL OR adet >= 0),
  okutma timestamptz NOT NULL DEFAULT now(),
  islendi timestamptz,
  CONSTRAINT stok_seri_okutma_sira_tek UNIQUE (liste_id, sira)
);
