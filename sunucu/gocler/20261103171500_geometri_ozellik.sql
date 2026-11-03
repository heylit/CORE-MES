-- 3D Atölyesi özellik tanıma (kart 2044; 1923 b): kesin B-rep yüzlerinden tanınan delik, kademe, havşa, pah ve radyüs. Yeni boş tablo.
-- Sonuç yalnız öneridir; satırlar analizle birlikte yenilenir. Revizyon kimliği geometri_yuz'daki gibi yabancı anahtarsızdır.
CREATE TABLE geometri_ozellik (
  revizyon_id int NOT NULL,
  sira int NOT NULL CONSTRAINT geometri_ozellik_sira CHECK (sira >= 1),
  tur text NOT NULL CONSTRAINT geometri_ozellik_tur CHECK (tur IN ('delik', 'kademe', 'havsa', 'pah', 'radyus')),
  -- Kademe ve havşanın bağlı olduğu deliğin sırası.
  ust_sira int CONSTRAINT geometri_ozellik_ust CHECK (ust_sira IS NULL OR (ust_sira >= 1 AND ust_sira <> sira)),
  -- Türün taşımadığı ölçü null'dır (sıfır uydurulmaz).
  cap_mm numeric(14, 4) CONSTRAINT geometri_ozellik_cap CHECK (cap_mm IS NULL OR cap_mm >= 0),
  yaricap_mm numeric(14, 4) CONSTRAINT geometri_ozellik_yaricap CHECK (yaricap_mm IS NULL OR yaricap_mm >= 0),
  derinlik_mm numeric(14, 4) CONSTRAINT geometri_ozellik_derinlik CHECK (derinlik_mm IS NULL OR derinlik_mm >= 0),
  aci_derece numeric(10, 4),
  genislik_mm numeric(14, 4) CONSTRAINT geometri_ozellik_genislik CHECK (genislik_mm IS NULL OR genislik_mm >= 0),
  boy_mm numeric(14, 4) CONSTRAINT geometri_ozellik_boy CHECK (boy_mm IS NULL OR boy_mm >= 0),
  gecis boolean,
  dip text CONSTRAINT geometri_ozellik_dip CHECK (dip IS NULL OR dip IN ('duz', 'matkap')),
  ic boolean,
  eksen numeric(10, 8)[] CONSTRAINT geometri_ozellik_eksen CHECK (eksen IS NULL OR cardinality(eksen) = 3),
  konum numeric(14, 4)[] CONSTRAINT geometri_ozellik_konum CHECK (konum IS NULL OR cardinality(konum) = 3),
  yuzler int[] NOT NULL CONSTRAINT geometri_ozellik_yuzler CHECK (cardinality(yuzler) >= 1),
  motor text NOT NULL CONSTRAINT geometri_ozellik_motor CHECK (btrim(motor) <> ''),
  PRIMARY KEY (revizyon_id, sira)
);
