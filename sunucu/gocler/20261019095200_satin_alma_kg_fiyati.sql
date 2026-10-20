-- Malzeme kg fiyatı (kalite + form başına) satın almada girilir; malzemenin birim fiyatı ve stokun güncel değeri bundan okunur.
-- Kur finanstandır (TL karşılığı okunurken hesaplanır). Geçmiş silinmez: her giriş ayrı satırdır, güncel fiyat geçerlilik günü bugünü geçmemiş en son giriştir. Form boşsa fiyat kalitenin bütün formlarınadır.
-- 214 a: talaşın satış fiyatı aynı satırda, aynı para biriminde; boşsa talaş değeri bilinmiyor sayılır (malzeme maliyetinden düşülmez).
CREATE TABLE satin_alma_kg_fiyati (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kalite_kodu text NOT NULL CONSTRAINT satin_alma_kg_fiyati_kalite CHECK (btrim(kalite_kodu) = kalite_kodu AND kalite_kodu <> '' AND length(kalite_kodu) <= 60),
  form text CONSTRAINT satin_alma_kg_fiyati_form CHECK (form IS NULL OR (btrim(form) = form AND form <> '' AND length(form) <= 40)),
  kg_fiyati numeric(18,4) NOT NULL CONSTRAINT satin_alma_kg_fiyati_pozitif CHECK (kg_fiyati > 0),
  talas_kg_fiyati numeric(18,4) CONSTRAINT satin_alma_kg_fiyati_talas CHECK (talas_kg_fiyati > 0),
  para_birimi char(3) NOT NULL CONSTRAINT satin_alma_kg_fiyati_para_birimi CHECK (para_birimi IN ('TRY', 'USD', 'EUR', 'GBP')),
  gecerlilik date NOT NULL,
  aciklama text NOT NULL DEFAULT '' CONSTRAINT satin_alma_kg_fiyati_aciklama CHECK (length(aciklama) <= 500),
  kisi_id int NOT NULL CONSTRAINT satin_alma_kg_fiyati_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX satin_alma_kg_fiyati_anahtar ON satin_alma_kg_fiyati (kalite_kodu, form, gecerlilik DESC, id DESC);
CREATE TRIGGER satin_alma_kg_fiyati_yalniz_ekleme BEFORE UPDATE OR DELETE ON satin_alma_kg_fiyati FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
