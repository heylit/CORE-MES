-- Sayı ayarı bir kez dolduktan sonra yeniden boşaltılabilir (LH2 b): boş (JSON null) satırıyla saklanır ve satırın yokluğundan (varsayılan)
-- ayrı okunur; değersiz satırı (SQL NULL) NOT NULL reddeder. Hiçbir satır değişmez.
DO $$
DECLARE
  satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM ayar;
  RAISE NOTICE 'ayar: % satır; ayar_deger_dolu kısıtı kalkar, hiçbir değer değişmez', satir;
END $$;

ALTER TABLE ayar DROP CONSTRAINT ayar_deger_dolu;
