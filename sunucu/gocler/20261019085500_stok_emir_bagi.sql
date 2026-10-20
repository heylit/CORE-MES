-- 142 a: stoğun emir bağı yabancı anahtar olur; sarf ve istasyona teslim iş emrine (rota adımı) de bağlanır.
-- Veri değişmez. Yetim satır (silinmiş ya da hiç olmamış emre bağlı) varsa kısıt NOT VALID kalır: yeni satırı denetler, eskiye
-- dokunmaz; sayısı NOTICE ile yazılır, düzeltmesi ayrı kararla. Yetim yoksa kısıt doğrulanır.
DO $$
DECLARE
  t text;
  yetim bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['stok_parti', 'stok_hareketi', 'stok_fis', 'stok_malzeme_istegi', 'stok_teslim', 'stok_rezerve', 'stok_rezerve_kaydi'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (uretim_emri_id) REFERENCES uretim_emri NOT VALID', t, t || '_uretim_emri_fk');
    EXECUTE format('SELECT count(*) FROM %I x WHERE x.uretim_emri_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM uretim_emri e WHERE e.id = x.uretim_emri_id)', t) INTO yetim;
    IF yetim = 0 THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', t, t || '_uretim_emri_fk');
    ELSE
      RAISE NOTICE '%: % satir var olmayan emre bagli; kisit yalniz yeni satirlari denetler.', t, yetim;
    END IF;
  END LOOP;
END $$;

-- Hareket yalnız eklenir (tetikleyici); hareketi olan iş emri silinmez, bağ reddeder (192). Bekleyen iş emri silinebilir
-- (uretim-emirleri); ona yapılmış teslimin emir bağı kalır, adım bağı boşalır.
ALTER TABLE stok_hareketi ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri;
ALTER TABLE stok_teslim ADD COLUMN is_emri_id int REFERENCES uretim_emirleri_is_emri ON DELETE SET NULL;
ALTER TABLE stok_hareketi ADD CONSTRAINT stok_hareketi_is_emri_emirli CHECK (is_emri_id IS NULL OR uretim_emri_id IS NOT NULL);
ALTER TABLE stok_teslim ADD CONSTRAINT stok_teslim_is_emri_emirli CHECK (is_emri_id IS NULL OR uretim_emri_id IS NOT NULL);
CREATE INDEX stok_hareketi_is_emri_idx ON stok_hareketi (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX stok_teslim_is_emri_idx ON stok_teslim (is_emri_id) WHERE is_emri_id IS NOT NULL;
