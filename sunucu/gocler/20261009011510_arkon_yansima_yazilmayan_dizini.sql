-- "TMI'ye yazılamayanlar" listesi ve sayımı (sonuc <> 'yazildi') büyük tabloda taranmasın; satır değişmez, kapsadığı satır sayısı bildirilir.
DO $$
DECLARE
  kapsanan bigint;
BEGIN
  SELECT count(*) INTO kapsanan FROM arkon_tmi_yansima WHERE sonuc <> 'yazildi';
  RAISE NOTICE 'arkon_tmi_yansima: yazılmamış % satır dizine girer; hiçbir satır değişmez', kapsanan;
END $$;

CREATE INDEX arkon_tmi_yansima_yazilmayan_idx ON arkon_tmi_yansima (id) WHERE sonuc <> 'yazildi';
