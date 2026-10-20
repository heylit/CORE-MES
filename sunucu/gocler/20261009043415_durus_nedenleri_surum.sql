-- Nedeni iki kişi aynı anda düzenleyebilir; sonra yazan öncekini sessizce ezmesin (CK2). Eski satırlar 1 ile başlar, başka değer değişmez.
DO $$
DECLARE
  durus bigint;
  hurda bigint;
BEGIN
  SELECT count(*) INTO durus FROM durus_nedeni;
  SELECT count(*) INTO hurda FROM hurda_nedeni;
  RAISE NOTICE 'durus_nedeni: % satır, hurda_nedeni: % satır sürüm 1 ile başlar; hiçbir değer değişmez', durus, hurda;
END $$;

ALTER TABLE durus_nedeni ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT durus_nedeni_surum_pozitif CHECK (surum > 0);
ALTER TABLE hurda_nedeni ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT hurda_nedeni_surum_pozitif CHECK (surum > 0);
