-- Rotada statülü (ara) adımdan kendiliğinden açılan statü tanımı; statülü stok miktarı stok tarafında tutulur (kart #1107).
CREATE TABLE recete_rota_statu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_no text NOT NULL,
  ad text NOT NULL,
  kaynak_adim text NOT NULL,
  renk text NOT NULL,
  tur text NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recete_rota_statu_malzeme_no_dolu CHECK (btrim(malzeme_no) <> ''),
  CONSTRAINT recete_rota_statu_ad_dolu CHECK (btrim(ad) <> ''),
  CONSTRAINT recete_rota_statu_adim_tekil UNIQUE (kaynak_adim),
  CONSTRAINT recete_rota_statu_kaynak_dolu CHECK (btrim(kaynak_adim) <> ''),
  CONSTRAINT recete_rota_statu_renk_bicimi CHECK (renk ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT recete_rota_statu_tur CHECK (tur IN ('HM', 'YM', 'MM'))
);
