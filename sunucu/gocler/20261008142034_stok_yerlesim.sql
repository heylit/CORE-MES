-- Stok Merkezi: depo yerleşimi (bina, mal kabul alanı, dama tahtası kare boyu, fason dolabı). Depo başına bir satır, sürümlü.
-- Eksen önizlemedeki gibidir: x sağa, z öne (girişe); raf yerleşimi stok_raf'tadır (x_m, z_m, aci, on_yuz_ters).
CREATE TABLE stok_depo_yerlesimi (
  depo_id int PRIMARY KEY REFERENCES stok_depo,
  bina_x0 numeric(7,2) NOT NULL,
  bina_x1 numeric(7,2) NOT NULL,
  bina_z0 numeric(7,2) NOT NULL,
  bina_z1 numeric(7,2) NOT NULL,
  kabul_x numeric(7,2) NOT NULL,
  kabul_z numeric(7,2) NOT NULL,
  kabul_genislik numeric(6,2) NOT NULL CONSTRAINT stok_depo_yerlesimi_kabul_genislik CHECK (kabul_genislik >= 1),
  kabul_derinlik numeric(6,2) NOT NULL CONSTRAINT stok_depo_yerlesimi_kabul_derinlik CHECK (kabul_derinlik >= 1),
  kare_boyu numeric(5,2) NOT NULL DEFAULT 5 CONSTRAINT stok_depo_yerlesimi_kare_boyu CHECK (kare_boyu BETWEEN 1 AND 50),
  fason_x numeric(7,2) NOT NULL,
  fason_z numeric(7,2) NOT NULL,
  fason_aci smallint NOT NULL DEFAULT 0 CONSTRAINT stok_depo_yerlesimi_fason_aci CHECK (fason_aci IN (0, 90, 180, 270)),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_depo_yerlesimi_bina_boyu CHECK (bina_x1 - bina_x0 >= 5 AND bina_z1 - bina_z0 >= 5)
);
-- Kare adları (dama tahtası): depo zemininde kareye verilen ad, örn. "C4 · Sevkiyat hazırlık".
CREATE TABLE stok_kare_adi (
  depo_id int NOT NULL REFERENCES stok_depo,
  kare text NOT NULL CONSTRAINT stok_kare_adi_bicimi CHECK (kare ~ '^[A-Z]{1,2}[0-9]{1,3}$'),
  ad text NOT NULL CONSTRAINT stok_kare_adi_ad_bicimi CHECK (btrim(ad) <> '' AND length(ad) <= 40),
  PRIMARY KEY (depo_id, kare)
);
-- Göz kodları raf düzenlenirken toplu yeniden yazılır; ara durumda iki göz kısa süre aynı kodu taşıyabilir. Tekillik
-- ertelenebilir: servis toplu yazımda erteler ve bitince anında denetime döndürür (gerçek çakışma yine 409).
ALTER TABLE stok_konum DROP CONSTRAINT stok_konum_kod_tek, ADD CONSTRAINT stok_konum_kod_tek UNIQUE (kod) DEFERRABLE INITIALLY IMMEDIATE;
-- Sistem sabiti: ana deponun başlangıç yerleşimi (40 × 40 m bina, girişte mal kabul alanı).
INSERT INTO stok_depo_yerlesimi (depo_id, bina_x0, bina_x1, bina_z0, bina_z1, kabul_x, kabul_z, kabul_genislik, kabul_derinlik, fason_x, fason_z)
  SELECT id, -10, 30, -30, 10, 10, 5, 12, 5, -8, 0 FROM stok_depo WHERE kod = 'ANA';
