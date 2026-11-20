-- 3478-3 a: sınırlı bildirim kural motoru. Kural, kodun yayınladığı olaya basit koşul, alıcı, kanal ve şablon ekler; olay izi
-- kaydetmeden önceki 7 günlük ön izleme içindir ve 7 günden eskisi yazılırken silinir. Var olan veriye dokunmaz.
CREATE TABLE bildirim_kurali (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT bildirim_kurali_tur CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  ad text NOT NULL CONSTRAINT bildirim_kurali_ad CHECK (length(btrim(ad)) BETWEEN 1 AND 80),
  acik boolean NOT NULL,
  kosullar jsonb NOT NULL CONSTRAINT bildirim_kurali_kosullar CHECK (jsonb_typeof(kosullar) = 'array' AND jsonb_array_length(kosullar) <= 10),
  rol_idleri int[] NOT NULL DEFAULT '{}' CONSTRAINT bildirim_kurali_roller CHECK (cardinality(rol_idleri) <= 50),
  kisi_idleri int[] NOT NULL DEFAULT '{}' CONSTRAINT bildirim_kurali_kisiler CHECK (cardinality(kisi_idleri) <= 100),
  ortada boolean NOT NULL DEFAULT false,
  eposta boolean NOT NULL DEFAULT false,
  telefon boolean NOT NULL DEFAULT false,
  sablon_baslik text NOT NULL CONSTRAINT bildirim_kurali_baslik CHECK (length(btrim(sablon_baslik)) BETWEEN 1 AND 200),
  sablon_metin text CONSTRAINT bildirim_kurali_metin CHECK (sablon_metin IS NULL OR length(sablon_metin) <= 1000),
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_kurali_surum CHECK (surum >= 1),
  degistiren_id int CONSTRAINT bildirim_kurali_degistiren REFERENCES kisi (id),
  degisti timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bildirim_kurali_tur_dizini ON bildirim_kurali (tur, id);

CREATE TABLE bildirim_olay_izi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT bildirim_olay_izi_tur CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  degerler jsonb NOT NULL CONSTRAINT bildirim_olay_izi_degerler CHECK (jsonb_typeof(degerler) = 'object'),
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bildirim_olay_izi_tur_zaman ON bildirim_olay_izi (tur, zaman);
