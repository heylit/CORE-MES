-- 1207 c: fasonda hurdaya ayrılan ya da firmadan gelmeyen parçayı GKK adımı hatalı sayar; kalite kolu NCR ile inceler. Bu iki tür
-- hatalı türleri listesinde sabit kodla durur: GKK ve stok kuralı kodu tanır (durus-nedenleri/kurallar.ts). Yalnız satır eklenir; aynı
-- kod önceden açılmışsa dokunulmaz (adı yöneticinindir).
INSERT INTO hurda_nedeni (kod, ad, sira)
SELECT v.kod, v.ad, COALESCE((SELECT max(sira) FROM hurda_nedeni), 0) + v.n
  FROM (VALUES ('FSN-HURDA', 'Firmada hurda', 1), ('FSN-GELMEDI', 'Firmadan gelmedi', 2)) AS v (kod, ad, n)
ON CONFLICT (kod) DO NOTHING;

DO $$
DECLARE
  n int := (SELECT count(*) FROM hurda_nedeni WHERE kod IN ('FSN-HURDA', 'FSN-GELMEDI'));
BEGIN
  IF n <> 2 THEN RAISE EXCEPTION 'durus_nedenleri_fason_hatali_turleri: iki sabit tür bekleniyordu, % var', n; END IF;
END $$;
