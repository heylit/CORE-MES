-- 3398 (surum 4 a): kesimden kalan parça ölçüsüyle tutulur ki ölçüyle aramada önerilsin. Bakiye miktarı değişmez; artık, bakiyedeki
-- malzemenin hangi konumda hangi boyda durduğunun kaydıdır. Mevcut veri dönüştürülmez.
CREATE TABLE stok_artik_parca (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id integer NOT NULL CONSTRAINT stok_artik_parca_malzeme_var REFERENCES malzeme_katalog_karti (no),
  konum_id int NOT NULL CONSTRAINT stok_artik_parca_konum_var REFERENCES stok_konum,
  parti_id bigint,
  -- Kartın ölçüsü, boyu (levhada eni de) kalan ölçüyle; anahtarlar kartın dims anahtarlarıdır, değerler mm.
  olcu jsonb NOT NULL CONSTRAINT stok_artik_parca_olcu_nesne CHECK (jsonb_typeof(olcu) = 'object' AND olcu <> '{}'::jsonb),
  adet int NOT NULL DEFAULT 1 CONSTRAINT stok_artik_parca_adet_pozitif CHECK (adet > 0),
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT stok_artik_parca_durum_degeri CHECK (durum IN ('acik', 'kullanildi', 'hurda')),
  aciklama text CONSTRAINT stok_artik_parca_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 200)),
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kayit_zamani timestamptz NOT NULL DEFAULT now(),
  kapatan_kisi_id int REFERENCES kisi,
  kapanis_zamani timestamptz,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_artik_parca_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_artik_parca_kapanis_butun CHECK ((durum = 'acik') = (kapatan_kisi_id IS NULL AND kapanis_zamani IS NULL))
);
CREATE INDEX stok_artik_parca_acik_idx ON stok_artik_parca (malzeme_id, id) WHERE durum = 'acik';
