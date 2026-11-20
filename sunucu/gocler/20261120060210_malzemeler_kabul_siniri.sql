-- 3463 C (dilim 1): kartta seçilen kabul sınırları (izinli değer listesi ya da alt-üst ölçü aralığı) ve aynı malzemenin farklı
-- kartlarını bağlayan eşdeğer grubu. Yalnız ekleyen göç; 3437 kuralları ve muadilleri olduğu gibi kalır, sınır onları nitelik başına ezer.

-- Nitelik başına tek satır; dar kapsam (kart < kalite < sınıf < aile) geniş olanı ezer. Liste niteliği (kalite, durum, yüzey) izinli
-- değerleri ve türlerini, ölçü niteliği mm cinsinden alt ve üst sınırı taşır.
CREATE TABLE malzeme_kabul_siniri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kapsam_turu text NOT NULL CONSTRAINT malzeme_kabul_siniri_kapsam_turu CHECK (kapsam_turu IN ('aile', 'sinif', 'kalite', 'kart')),
  kapsam text NOT NULL CONSTRAINT malzeme_kabul_siniri_kapsam_dolu CHECK (btrim(kapsam) = kapsam AND kapsam <> '' AND length(kapsam) <= 64),
  nitelik text NOT NULL CONSTRAINT malzeme_kabul_siniri_nitelik
    CHECK (nitelik IN ('kalite', 'durum', 'yuzey', 'd', 's', 'a', 'b', 't', 'D', 'h', 'l')),
  degerler jsonb,
  alt numeric(10, 3) CONSTRAINT malzeme_kabul_siniri_alt CHECK (alt >= 0 AND alt <= 100000),
  ust numeric(10, 3) CONSTRAINT malzeme_kabul_siniri_ust CHECK (ust >= 0 AND ust <= 100000),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT malzeme_kabul_siniri_tek UNIQUE (kapsam_turu, kapsam, nitelik),
  CONSTRAINT malzeme_kabul_siniri_kart_no CHECK (kapsam_turu <> 'kart' OR kapsam ~ '^[1-9][0-9]{0,9}$'),
  CONSTRAINT malzeme_kabul_siniri_bicim CHECK (
    (nitelik IN ('kalite', 'durum', 'yuzey') AND jsonb_typeof(degerler) = 'array' AND alt IS NULL AND ust IS NULL)
    OR (nitelik NOT IN ('kalite', 'durum', 'yuzey') AND degerler IS NULL AND (alt IS NOT NULL OR ust IS NOT NULL))),
  CONSTRAINT malzeme_kabul_siniri_sira CHECK (alt IS NULL OR ust IS NULL OR alt <= ust)
);

-- Grup, ilk bağlanan kartın numarasıdır; kart en çok bir gruptadır. Grubun her üyesi satır taşır (grubu kuran dahil).
CREATE TABLE malzeme_esdeger_bagi (
  kart_no int PRIMARY KEY CONSTRAINT malzeme_esdeger_bagi_kart REFERENCES malzeme_katalog_karti (no),
  grup int NOT NULL CONSTRAINT malzeme_esdeger_bagi_grup REFERENCES malzeme_katalog_karti (no),
  ekleyen_kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX malzeme_esdeger_bagi_grup_dizini ON malzeme_esdeger_bagi (grup);
