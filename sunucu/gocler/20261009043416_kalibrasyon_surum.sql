-- Aleti ya da türü iki kişi aynı anda düzenleyebilir; sonra yazan öncekini sessizce ezmesin (CK2). Eski satırlar 1 ile başlar, başka değer değişmez.
DO $$
DECLARE
  alet bigint;
  tur bigint;
BEGIN
  SELECT count(*) INTO alet FROM olcu_aleti;
  SELECT count(*) INTO tur FROM olcu_aleti_turu;
  RAISE NOTICE 'olcu_aleti: % satır, olcu_aleti_turu: % satır sürüm 1 ile başlar; hiçbir değer değişmez', alet, tur;
END $$;

ALTER TABLE olcu_aleti ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT olcu_aleti_surum_pozitif CHECK (surum > 0);
ALTER TABLE olcu_aleti_turu ADD COLUMN surum int NOT NULL DEFAULT 1 CONSTRAINT olcu_aleti_turu_surum_pozitif CHECK (surum > 0);
