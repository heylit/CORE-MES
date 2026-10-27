-- 898 a, 902 a: plan canlıya alınınca malzeme eksiği satın almaya tam liste olarak yazılır (planın artık istemediği satır silinir).
-- Satır stokla karşılanamayan miktardır; açık sipariş ve açık talep okurken düşülür, kalan "Plan ihtiyacı" ön talebidir. Yeni ve boş tablo.
CREATE TABLE satin_alma_plan_ihtiyaci (
  malzeme_no int PRIMARY KEY CONSTRAINT satin_alma_plan_ihtiyaci_malzeme REFERENCES malzeme_katalog_karti (no),
  miktar numeric(18,4) NOT NULL CONSTRAINT satin_alma_plan_ihtiyaci_miktar CHECK (miktar > 0),
  gereken_tarih date NOT NULL,
  emirler text[] NOT NULL CONSTRAINT satin_alma_plan_ihtiyaci_emirler CHECK (cardinality(emirler) BETWEEN 1 AND 200),
  stok_bilinmiyor boolean NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now()
);
