-- 798: Kalite Merkezi kararının aynalandığı açık numune istekleri (bekliyor, ölçülüyor) 15 saniyede bir okunur; depo büyüdükçe tarama
-- olmasın. Dizin yalnız açık istekleri kapsar. Satır değişmez, kapsanan sayı bildirilir.
DO $$
DECLARE
  acik bigint;
BEGIN
  SELECT count(*) INTO acik FROM arkon_belge WHERE depo = 'requests' AND govde->>'status' IN ('waiting', 'measuring');
  RAISE NOTICE 'arkon_belge: % açık numune isteği dizine girer; hiçbir satır değişmez', acik;
END $$;

CREATE INDEX arkon_belge_acik_istek_idx ON arkon_belge (degisti) WHERE depo = 'requests' AND govde->>'status' IN ('waiting', 'measuring');
