-- Stok Merkezi: depocu sepeti (kişiye özel) ve teslim fişi. Fiş değişmez; fişin hareketleri fiş satırıyla bağlanır.

-- Sepet satırı kişinindir; yalnız sahibi görür ve değiştirir (DEP-54). Kaynak konum boşsa teslimde en eski girişten
-- alınır (DEP-41); parti ancak kaynak konumla verilir.
CREATE TABLE stok_sepet_satiri (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL REFERENCES kisi,
  malzeme_id integer NOT NULL CONSTRAINT stok_sepet_satiri_malzeme_var REFERENCES malzeme_katalog_karti (no),
  kaynak_konum_id int REFERENCES stok_konum,
  parti_id bigint,
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_sepet_satiri_miktar_pozitif CHECK (miktar > 0),
  eklenme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stok_sepet_satiri_parti_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_sepet_satiri_parti_konumla CHECK (parti_id IS NULL OR kaynak_konum_id IS NOT NULL),
  CONSTRAINT stok_sepet_satiri_tek UNIQUE NULLS NOT DISTINCT (kisi_id, malzeme_id, kaynak_konum_id, parti_id)
);
CREATE INDEX stok_sepet_satiri_kisi_idx ON stok_sepet_satiri (kisi_id, id);

-- Teslim fişi: hedef ya bir konumdur (taşıma) ya da çıkış nedenidir (stoktan düşme); ikisi birden olmaz.
CREATE TABLE stok_fis (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('TF-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  zaman timestamptz NOT NULL DEFAULT now(),
  hedef_konum_id int REFERENCES stok_konum,
  cikis_nedeni text CONSTRAINT stok_fis_cikis_nedeni CHECK (cikis_nedeni IN ('uretime_sarf', 'sevk', 'fire', 'numune', 'diger')),
  uretim_emri_id int, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  teslim_alan_kisi_id int REFERENCES kisi,
  aciklama text CONSTRAINT stok_fis_aciklama_bicimi CHECK (btrim(aciklama) <> '' AND length(aciklama) <= 200),
  kisi_id int NOT NULL REFERENCES kisi,
  CONSTRAINT stok_fis_no_tek UNIQUE (no),
  CONSTRAINT stok_fis_hedef_tek CHECK ((hedef_konum_id IS NULL) <> (cikis_nedeni IS NULL)),
  CONSTRAINT stok_fis_sarf_emirli CHECK (cikis_nedeni IS DISTINCT FROM 'uretime_sarf' OR uretim_emri_id IS NOT NULL)
);
CREATE INDEX stok_fis_zaman_idx ON stok_fis (zaman, id);
CREATE TRIGGER stok_fis_degismez BEFORE UPDATE OR DELETE ON stok_fis FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_fis_bosaltilmaz BEFORE TRUNCATE ON stok_fis FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE stok_fis_satiri (
  fis_id int NOT NULL REFERENCES stok_fis,
  hareket_id bigint NOT NULL REFERENCES stok_hareketi,
  PRIMARY KEY (fis_id, hareket_id),
  CONSTRAINT stok_fis_satiri_hareket_tek UNIQUE (hareket_id)
);
CREATE TRIGGER stok_fis_satiri_degismez BEFORE UPDATE OR DELETE ON stok_fis_satiri FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_fis_satiri_bosaltilmaz BEFORE TRUNCATE ON stok_fis_satiri FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
