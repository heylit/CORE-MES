-- 3D Atölyesi kesin yüz türü (kart 1984; 1923 b, 1983 a): revizyonun B-rep yüzleri, özellik tanımanın girdisi. Yeni boş tablo.
-- Revizyon kimliği geometri_analiz'deki gibi yabancı anahtarsızdır (yön geometri -> cizimler). Satırlar analizle birlikte yazılır.
CREATE TABLE geometri_yuz (
  revizyon_id int NOT NULL,
  sira int NOT NULL CONSTRAINT geometri_yuz_sira CHECK (sira >= 1),
  tur text NOT NULL CONSTRAINT geometri_yuz_tur
    CHECK (tur IN ('duzlem', 'silindir', 'koni', 'kure', 'torus', 'bezier', 'bspline', 'donel', 'ekstruzyon', 'ofset', 'diger')),
  -- Yüz yönü yüzeyin doğal normalinin tersi mi (delik ile mil ayrımı için).
  ters boolean NOT NULL,
  alan_mm2 numeric(20, 4) NOT NULL CONSTRAINT geometri_yuz_alan CHECK (alan_mm2 >= 0),
  -- Türün taşımadığı ölçü null'dır (sıfır uydurulmaz).
  yaricap_mm numeric(14, 4) CONSTRAINT geometri_yuz_yaricap CHECK (yaricap_mm IS NULL OR yaricap_mm >= 0),
  ikinci_yaricap_mm numeric(14, 4) CONSTRAINT geometri_yuz_ikinci_yaricap CHECK (ikinci_yaricap_mm IS NULL OR ikinci_yaricap_mm >= 0),
  yari_aci_derece numeric(10, 4) CONSTRAINT geometri_yuz_yari_aci CHECK (yari_aci_derece IS NULL OR (yari_aci_derece > -90 AND yari_aci_derece < 90)),
  eksen numeric(10, 8)[] CONSTRAINT geometri_yuz_eksen CHECK (eksen IS NULL OR cardinality(eksen) = 3),
  konum numeric(14, 4)[] CONSTRAINT geometri_yuz_konum CHECK (konum IS NULL OR cardinality(konum) = 3),
  motor text NOT NULL CONSTRAINT geometri_yuz_motor CHECK (btrim(motor) <> ''),
  PRIMARY KEY (revizyon_id, sira)
);
