-- Üretimden gelen malzeme isteği (Arkon operatörü): depo hazırlar, teslim eder ya da iptal eder. Kaynak kimliği çağıranın
-- belgesidir ve tekrar korumasıdır: aynı belge ikinci kez istek açmaz.
CREATE TABLE stok_malzeme_istegi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('MI-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  kaynak_kimligi text NOT NULL CONSTRAINT stok_malzeme_istegi_kaynak_bicimi CHECK (btrim(kaynak_kimligi) = kaynak_kimligi AND length(kaynak_kimligi) BETWEEN 3 AND 120),
  malzeme_id integer NOT NULL CONSTRAINT stok_malzeme_istegi_malzeme_var REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_malzeme_istegi_miktar_pozitif CHECK (miktar > 0),
  istasyon_id int NOT NULL CONSTRAINT stok_malzeme_istegi_istasyon_var REFERENCES istasyon,
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  aciklama text CONSTRAINT stok_malzeme_istegi_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 200)),
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT stok_malzeme_istegi_durum_degeri CHECK (durum IN ('acik', 'hazirlaniyor', 'teslim', 'iptal')),
  -- Teslimde depo karşıladığı miktarı yazar; teslimden önce bilinmez (sıfır uydurulmaz).
  karsilanan numeric(14,3) CONSTRAINT stok_malzeme_istegi_karsilanan_negatif_degil CHECK (karsilanan >= 0),
  kisi_id int NOT NULL REFERENCES kisi,
  acilis timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  kapatan_kisi_id int REFERENCES kisi,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_malzeme_istegi_no_tek UNIQUE (no),
  CONSTRAINT stok_malzeme_istegi_kaynak_tek UNIQUE (kaynak_kimligi),
  CONSTRAINT stok_malzeme_istegi_teslim_karsilanmis CHECK ((durum = 'teslim') = (karsilanan IS NOT NULL)),
  CONSTRAINT stok_malzeme_istegi_kapanis_tutarli CHECK ((durum IN ('teslim', 'iptal')) = (kapatan_kisi_id IS NOT NULL))
);
CREATE INDEX stok_malzeme_istegi_acilis_idx ON stok_malzeme_istegi (acilis, id);
