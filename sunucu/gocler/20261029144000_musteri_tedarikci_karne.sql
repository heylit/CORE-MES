-- Tedarikçi karnesi (1259 c, 1260 a): satın alma teslimi ve Kalite Merkezi lot kararını olay olarak iter, hizmet puanı ve yıllık karne
-- Müşteri-Tedarikçi ekranında girilir. Üçü de yeni ve boş tablodur; dolu tabloya dokunulmaz.
CREATE TABLE musteri_tedarikci_karne_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id integer NOT NULL REFERENCES musteri_tedarikci_firma (id),
  kaynak text NOT NULL CHECK (kaynak IN ('satin-alma', 'kalite-merkezi', 'uretim-emirleri')),
  anahtar text NOT NULL CHECK (length(btrim(anahtar)) BETWEEN 1 AND 120),
  tur text NOT NULL CHECK (tur IN ('teslim', 'lot')),
  zaman timestamptz NOT NULL,
  termin date,
  teslim_gunu date,
  tam boolean,
  lot_karari text CHECK (lot_karari IN ('kabul', 'sartli_kabul', 'hatali_kabul', 'red', 'iade')),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  -- Aynı kaydın sonraki kararı öncekinin yerine geçer; geri doldurma tekrar güvenlidir.
  CONSTRAINT musteri_tedarikci_karne_olayi_tekil UNIQUE (kaynak, anahtar),
  CONSTRAINT musteri_tedarikci_karne_olayi_alanlar CHECK (
    (tur = 'teslim' AND num_nonnulls(termin, teslim_gunu, tam) = 3 AND lot_karari IS NULL)
    OR (tur = 'lot' AND lot_karari IS NOT NULL AND num_nonnulls(termin, teslim_gunu, tam) = 0))
);
CREATE INDEX musteri_tedarikci_karne_olayi_firma ON musteri_tedarikci_karne_olayi (firma_id, tur, zaman);

CREATE TABLE musteri_tedarikci_hizmet_puani (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id integer NOT NULL REFERENCES musteri_tedarikci_firma (id),
  puan smallint NOT NULL CHECK (puan BETWEEN 1 AND 5),
  "not" text CHECK (length("not") <= 500),
  giren_id integer NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX musteri_tedarikci_hizmet_puani_firma ON musteri_tedarikci_hizmet_puani (firma_id, olusturma);

-- Yıllık karne o anki kayan puanın kaydıdır (ISO 9001 8.4.1); firma başına yılda bir.
CREATE TABLE musteri_tedarikci_yillik_karne (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id integer NOT NULL REFERENCES musteri_tedarikci_firma (id),
  yil integer NOT NULL CHECK (yil BETWEEN 2000 AND 2100),
  teslim_orani numeric(4,1) CHECK (teslim_orani BETWEEN 0 AND 100),
  kalite_puani numeric(4,1) CHECK (kalite_puani BETWEEN 0 AND 100),
  hizmet_puani numeric(4,1) CHECK (hizmet_puani BETWEEN 0 AND 100),
  puan numeric(4,1) CHECK (puan BETWEEN 0 AND 100),
  sinif text CHECK (sinif IN ('A', 'B', 'C', 'D')),
  "not" text CHECK (length("not") <= 1000),
  degerlendiren_id integer NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT musteri_tedarikci_yillik_karne_tekil UNIQUE (firma_id, yil),
  CONSTRAINT musteri_tedarikci_yillik_karne_sinif_puanli CHECK ((puan IS NULL) = (sinif IS NULL))
);
