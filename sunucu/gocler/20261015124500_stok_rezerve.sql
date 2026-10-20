-- Malzeme üretim emrine ayrılır: ayrılan miktarı yalnız o emir tüketir; ayrı tutar konum ve partiden bağımsızdır (malzeme taşınsa da ayrı kalır).
-- Statü boşsa serbest malzemenin ayrılanıdır (emir açılışında stoktan); statüye geçince ayrılan statüyle ilerler.
CREATE TABLE stok_rezerve (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id integer NOT NULL CONSTRAINT stok_rezerve_malzeme_var REFERENCES malzeme_katalog_karti (no),
  statu_id int CONSTRAINT stok_rezerve_statu_var REFERENCES recete_rota_statu (id),
  uretim_emri_id int NOT NULL, -- Aşama 2: yabancı anahtar ayrı göçle (stok_parti ile aynı)
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_rezerve_miktar_pozitif CHECK (miktar > 0)
);
CREATE UNIQUE INDEX stok_rezerve_tek ON stok_rezerve (malzeme_id, (coalesce(statu_id, 0)), uretim_emri_id);

-- Elle ayırma ve kaldırma kaydı: kim, ne zaman, neden. Üretimin kendiliğinden ayırması hareketlerden okunur.
CREATE TABLE stok_rezerve_kaydi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id integer NOT NULL CONSTRAINT stok_rezerve_kaydi_malzeme_var REFERENCES malzeme_katalog_karti (no),
  statu_id int CONSTRAINT stok_rezerve_kaydi_statu_var REFERENCES recete_rota_statu (id),
  uretim_emri_id int NOT NULL,
  tur text NOT NULL CONSTRAINT stok_rezerve_kaydi_tur CHECK (tur IN ('ayir', 'kaldir')),
  miktar numeric(14,3) NOT NULL CONSTRAINT stok_rezerve_kaydi_miktar_pozitif CHECK (miktar > 0),
  neden text,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stok_rezerve_kaydi_kaldirma_nedeni CHECK (tur <> 'kaldir' OR btrim(coalesce(neden, '')) <> '')
);
CREATE INDEX stok_rezerve_kaydi_emir_idx ON stok_rezerve_kaydi (uretim_emri_id, id);
CREATE TRIGGER stok_rezerve_kaydi_degismez BEFORE UPDATE OR DELETE ON stok_rezerve_kaydi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_rezerve_kaydi_bosaltilmaz BEFORE TRUNCATE ON stok_rezerve_kaydi FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
