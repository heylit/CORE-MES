-- Kod anahtarında İ, I'ya katlanır (uygulamada `parcaAnahtari`; kullanıcı kararı 3371 a, 17.11.2026): Türkçe büyük harfte
-- 'mil' MİL, 'MIL' MIL olur ve aynı parça modelini, görünümünü ve gözünü bulmazdı. Saklanan anahtar zaten büyük harftir;
-- yalnız İ içeren anahtar değişir. Önce salt okuma sayımı: katlanınca iki satır aynı anahtara düşüyorsa hiçbir şey
-- değiştirilmez, çakışan satırlar listelenir. Eski anahtar yedek tabloda kalır; geri dönüş bu tabloyla yapılır.
LOCK TABLE atolye_kalem_gorunumu, atolye_goz_kalemi IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  cakisan text;
BEGIN
  SELECT string_agg(format('görünüm %s: %s', yeni, eskiler), '; ' ORDER BY yeni) INTO cakisan FROM (
    SELECT replace(kod_anahtari, 'İ', 'I') AS yeni, string_agg(kod_anahtari, ', ' ORDER BY kod_anahtari) AS eskiler
      FROM atolye_kalem_gorunumu GROUP BY 1 HAVING count(*) > 1) s;
  IF cakisan IS NOT NULL THEN
    RAISE EXCEPTION 'Katlanınca aynı anahtara düşen kalem görünümleri var, hiçbir şey değişmedi: %', cakisan;
  END IF;
  SELECT string_agg(format('göz %s, %s: %s', goz_id, yeni, eskiler), '; ' ORDER BY goz_id, yeni) INTO cakisan FROM (
    SELECT goz_id, replace(kod_anahtari, 'İ', 'I') AS yeni, string_agg(kod_anahtari, ', ' ORDER BY kod_anahtari) AS eskiler
      FROM atolye_goz_kalemi GROUP BY 1, 2 HAVING count(*) > 1) s;
  IF cakisan IS NOT NULL THEN
    RAISE EXCEPTION 'Katlanınca aynı gözde aynı anahtara düşen kalemler var, hiçbir şey değişmedi: %', cakisan;
  END IF;
END $$;

-- Geri dönüş: UPDATE atolye_kalem_gorunumu k SET kod_anahtari = y.eski FROM atolye_kod_anahtari_yedegi y
--   WHERE y.tablo = 'atolye_kalem_gorunumu' AND k.kod_anahtari = y.yeni; göz kalemi için satır kimliğiyle (y.satir_id).
CREATE TABLE atolye_kod_anahtari_yedegi (
  tablo text NOT NULL CONSTRAINT atolye_kod_anahtari_yedegi_tablo CHECK (tablo IN ('atolye_kalem_gorunumu', 'atolye_goz_kalemi')),
  satir_id int,
  eski text NOT NULL,
  yeni text NOT NULL,
  katlandi timestamptz NOT NULL DEFAULT now()
);
INSERT INTO atolye_kod_anahtari_yedegi (tablo, satir_id, eski, yeni)
SELECT 'atolye_kalem_gorunumu', NULL, kod_anahtari, replace(kod_anahtari, 'İ', 'I') FROM atolye_kalem_gorunumu WHERE kod_anahtari LIKE '%İ%'
UNION ALL
SELECT 'atolye_goz_kalemi', id, kod_anahtari, replace(kod_anahtari, 'İ', 'I') FROM atolye_goz_kalemi WHERE kod_anahtari LIKE '%İ%';

UPDATE atolye_kalem_gorunumu SET kod_anahtari = replace(kod_anahtari, 'İ', 'I') WHERE kod_anahtari LIKE '%İ%';
UPDATE atolye_goz_kalemi SET kod_anahtari = replace(kod_anahtari, 'İ', 'I') WHERE kod_anahtari LIKE '%İ%';

-- Denetim izinin ertelenmiş tetikleyicileri şimdi çalışır; bekleyen olay varken tablo değiştirilemez.
SET CONSTRAINTS ALL IMMEDIATE;

-- Katlanmamış anahtar bundan sonra yazılamaz.
ALTER TABLE atolye_kalem_gorunumu ADD CONSTRAINT atolye_kalem_gorunumu_anahtar_katli CHECK (kod_anahtari NOT LIKE '%İ%');
ALTER TABLE atolye_goz_kalemi ADD CONSTRAINT atolye_goz_kalemi_anahtar_katli CHECK (kod_anahtari NOT LIKE '%İ%');
