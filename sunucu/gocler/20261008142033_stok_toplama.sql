-- Stok Merkezi: toplama listesi. Kalemler en eski girişten gözlere ayrılır (DEP-06), adımlar rota sırasındadır (DEP-42);
-- her adım toplanınca çıkış hareketi yazılır. Liste iki kişi tarafından yürütülebilir: sürümlü.
CREATE TABLE stok_toplama (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('TL-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  ad text NOT NULL CONSTRAINT stok_toplama_ad_bicimi CHECK (btrim(ad) <> '' AND length(ad) <= 80),
  durum text NOT NULL DEFAULT 'topluyor' CONSTRAINT stok_toplama_durum_degeri CHECK (durum IN ('topluyor', 'bitti', 'iptal')),
  acilis timestamptz NOT NULL DEFAULT now(),
  kapanis timestamptz,
  kisi_id int NOT NULL REFERENCES kisi,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_toplama_no_tek UNIQUE (no),
  CONSTRAINT stok_toplama_kapanis_tutarli CHECK ((durum = 'topluyor') = (kapanis IS NULL))
);
CREATE INDEX stok_toplama_acilis_idx ON stok_toplama (acilis, id);

-- Kalem: istenen miktar ve açılışta karşılanamayan eksik (veri yetersiz; göz uydurulmaz).
CREATE TABLE stok_toplama_kalemi (
  toplama_id int NOT NULL REFERENCES stok_toplama,
  malzeme_id integer NOT NULL CONSTRAINT stok_toplama_kalemi_malzeme_var REFERENCES malzeme_katalog_karti (no),
  istenen numeric(14,3) NOT NULL CONSTRAINT stok_toplama_kalemi_istenen_pozitif CHECK (istenen > 0),
  eksik numeric(14,3) NOT NULL DEFAULT 0 CONSTRAINT stok_toplama_kalemi_eksik_araligi CHECK (eksik >= 0 AND eksik <= istenen),
  PRIMARY KEY (toplama_id, malzeme_id)
);

CREATE TABLE stok_toplama_adimi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  toplama_id int NOT NULL REFERENCES stok_toplama,
  sira smallint NOT NULL CONSTRAINT stok_toplama_adimi_sira_pozitif CHECK (sira > 0),
  malzeme_id integer NOT NULL,
  konum_id int NOT NULL REFERENCES stok_konum,
  parti_id bigint,
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_toplama_adimi_miktar_pozitif CHECK (miktar > 0),
  hareket_id bigint REFERENCES stok_hareketi,
  CONSTRAINT stok_toplama_adimi_kalemli FOREIGN KEY (toplama_id, malzeme_id) REFERENCES stok_toplama_kalemi (toplama_id, malzeme_id),
  CONSTRAINT stok_toplama_adimi_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_toplama_adimi_sira_tek UNIQUE (toplama_id, sira),
  CONSTRAINT stok_toplama_adimi_hareket_tek UNIQUE (hareket_id)
);
