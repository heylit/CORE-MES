-- Kurulum kaydı, hazırlık defteri ve takım ömrü kişiye ve üretim emrine yabancı anahtarla bağlanır; hazırlık kaydı olan iş emri silinmez.
-- 312 b: veri değişmez. Yetim satır (olmayan kayda bağlı) varsa kısıt NOT VALID kalır: yeni satırı denetler, eskiye
-- dokunmaz; sayısı NOTICE ile yazılır, düzeltmesi ayrı kararla. Yetim yoksa kısıt doğrulanır.
DO $$
DECLARE
  s text[];
  yetim bigint;
BEGIN
  FOREACH s SLICE 1 IN ARRAY ARRAY[
    ARRAY['cnc_kurulum_kayit', 'guncelleyen_kisi_id', 'kisi', 'cnc_kurulum_kayit_guncelleyen_kisi_id_fk'],
    ARRAY['cnc_kurulum_hazirlik_olayi', 'kisi_id', 'kisi', 'cnc_kurulum_hazirlik_olayi_kisi_id_fk'],
    ARRAY['cnc_kurulum_hazirlik_olayi', 'emir_id', 'uretim_emri', 'cnc_kurulum_hazirlik_olayi_emir_id_fk'],
    ARRAY['cnc_kurulum_hazirlik_olayi', 'is_emri_id', 'uretim_emirleri_is_emri', 'cnc_kurulum_hazirlik_olayi_is_emri_id_fk'],
    ARRAY['cnc_kurulum_takim_yuku', 'guncelleyen_kisi_id', 'kisi', 'cnc_kurulum_takim_yuku_guncelleyen_kisi_id_fk'],
    ARRAY['cnc_kurulum_takim_olayi', 'kisi_id', 'kisi', 'cnc_kurulum_takim_olayi_kisi_id_fk']
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I NOT VALID', s[1], s[4], s[2], s[3]);
    EXECUTE format('SELECT count(*) FROM %I x WHERE x.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I h WHERE h.id = x.%I)', s[1], s[2], s[3], s[2]) INTO yetim;
    IF yetim = 0 THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', s[1], s[4]);
    ELSE
      RAISE NOTICE '%.%: % satir olmayan kayda bagli; kisit yalniz yeni satirlari denetler.', s[1], s[2], yetim;
    END IF;
  END LOOP;
END $$;
