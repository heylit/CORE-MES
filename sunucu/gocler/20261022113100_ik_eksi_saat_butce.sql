-- IK-79 (Soru 112 b): devam süresi ve departman bütçesi eksi olamaz; kural sunucuda, kısıt burada.
-- Veri değişmez. Eksi satır varsa kısıt NOT VALID kalır: yeni ve değişen satırı denetler, eskiye dokunmaz; sayısı NOTICE ile
-- yazılır, temizliği ayrı kararla. Eksi satır yoksa kısıt doğrulanır.
DO $$
DECLARE
  k record;
  eksi bigint;
BEGIN
  FOR k IN SELECT * FROM (VALUES ('ik_devam', 'saat', 'ik_devam_saat_eksi_degil'), ('ik_departman', 'butce', 'ik_departman_butce_eksi_degil')) AS v (tablo, sutun, ad) LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I >= 0) NOT VALID', k.tablo, k.ad, k.sutun, k.sutun);
    EXECUTE format('SELECT count(*) FROM %I WHERE %I < 0', k.tablo, k.sutun) INTO eksi;
    IF eksi = 0 THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', k.tablo, k.ad);
    ELSE
      RAISE NOTICE '%: % satirda % eksi; kisit yalniz yeni ve degisen satirlari denetler.', k.tablo, eksi, k.sutun;
    END IF;
  END LOOP;
END $$;
