-- Malzeme iste (kart #95, soru 96 a ve b). Var olan satırlar değişmez, silinmez: eski istek depoya gider (kaynak istasyonu boş),
-- eski teslim okutarak alınmamış sayılır.
-- A: istek bir istasyondan da istenir; o istasyonun yetkilisi kabul edip teslim gönderir ya da nedeniyle reddeder.
-- B: alan kişi malzemeyi ve aldığı yeri okutarak başka istasyondan alır; kaynak onayı yoktur (T7 değişti). Telafi: kayıt işaretlidir,
-- kaynak taraf süre bitene kadar itiraz eder; itiraz geri almaz, iade teslimi açar.
DO $$
DECLARE istek bigint; teslim bigint;
BEGIN
  SELECT count(*) INTO istek FROM stok_malzeme_istegi;
  SELECT count(*) INTO teslim FROM stok_teslim;
  RAISE NOTICE 'stok_istek_kaynagi_okutarak_alma: % istek ve % teslim satiri degismez.', istek, teslim;
END $$;

ALTER TABLE stok_malzeme_istegi
  ADD COLUMN kaynak_istasyon_id int CONSTRAINT stok_malzeme_istegi_kaynak_istasyon_var REFERENCES istasyon,
  ADD COLUMN red_nedeni text CONSTRAINT stok_malzeme_istegi_red_bicimi CHECK (red_nedeni IS NULL OR (btrim(red_nedeni) <> '' AND length(red_nedeni) <= 200)),
  ADD CONSTRAINT stok_malzeme_istegi_kaynak_hedef_farkli CHECK (kaynak_istasyon_id IS NULL OR kaynak_istasyon_id IS DISTINCT FROM istasyon_id),
  -- Yalnız istasyondan istenen istek nedeniyle reddedilir; depo isteğinde iptalin nedeni yoktur.
  ADD CONSTRAINT stok_malzeme_istegi_red_tutarli CHECK (red_nedeni IS NULL OR (durum = 'iptal' AND kaynak_istasyon_id IS NOT NULL));
CREATE INDEX stok_malzeme_istegi_kaynak_istasyon_idx ON stok_malzeme_istegi (kaynak_istasyon_id) WHERE kaynak_istasyon_id IS NOT NULL AND durum IN ('acik', 'stok_yok');

ALTER TABLE stok_teslim
  ADD COLUMN okutarak boolean NOT NULL DEFAULT false,
  ADD COLUMN itiraz_sonu timestamptz,
  ADD COLUMN itiraz_nedeni text CONSTRAINT stok_teslim_itiraz_bicimi CHECK (itiraz_nedeni IS NULL OR (btrim(itiraz_nedeni) <> '' AND length(itiraz_nedeni) <= 200)),
  ADD COLUMN itiraz_kisi_id int CONSTRAINT stok_teslim_itiraz_kisi_var REFERENCES kisi,
  ADD COLUMN itiraz_zamani timestamptz,
  ADD COLUMN iade_teslim_id int CONSTRAINT stok_teslim_iade_var REFERENCES stok_teslim,
  ADD CONSTRAINT stok_teslim_okutarak_suresi CHECK (okutarak = (itiraz_sonu IS NOT NULL)),
  ADD CONSTRAINT stok_teslim_itiraz_tutarli CHECK (
    (itiraz_nedeni IS NULL) = (itiraz_kisi_id IS NULL) AND (itiraz_nedeni IS NULL) = (itiraz_zamani IS NULL)
    AND (itiraz_nedeni IS NULL OR (okutarak AND durum = 'teslim'))
    AND (iade_teslim_id IS NULL OR itiraz_nedeni IS NOT NULL)
  );
CREATE INDEX stok_teslim_okutarak_idx ON stok_teslim (kaynak_konum_id, kapanis) WHERE okutarak;
