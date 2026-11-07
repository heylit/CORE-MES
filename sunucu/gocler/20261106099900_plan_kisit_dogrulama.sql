-- Kaydı yazan kişi bağı eski satırlarda da denetlensin diye kısıt doğrulanır (2204-1 a, 312 b kalıbı). Veri değişmez:
-- olmayan kişiye bağlı eski satır varsa kısıt NOT VALID kalır, yalnız yeni yazmayı denetler; sayısı NOTICE ile yazılır.
DO $$
DECLARE yetim bigint;
BEGIN
  SELECT count(*) INTO yetim FROM plan_planlama_kaydi x
   WHERE NOT EXISTS (SELECT 1 FROM kisi k WHERE k.id = x.guncelleyen_kisi_id);
  IF yetim = 0 THEN
    ALTER TABLE plan_planlama_kaydi VALIDATE CONSTRAINT plan_planlama_kaydi_guncelleyen_kisi_fk;
  ELSE
    RAISE NOTICE 'plan_planlama_kaydi.guncelleyen_kisi_id: % satir olmayan kisiye bagli; kisit yalniz yeni satirlari denetler.', yetim;
  END IF;
END $$;
