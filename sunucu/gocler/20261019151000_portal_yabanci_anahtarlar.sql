-- Portal belgeleri ve ekleri kişiye, sipariş bağı Siparişler'in teklif ve siparişine yabancı anahtarla bağlanır.
-- 312 b: veri değişmez. Yetim satır (olmayan kayda bağlı) varsa kısıt NOT VALID kalır: yeni satırı denetler, eskiye
-- dokunmaz; sayısı NOTICE ile yazılır, düzeltmesi ayrı kararla. Yetim yoksa kısıt doğrulanır.
DO $$
DECLARE
  s text[];
  yetim bigint;
BEGIN
  FOREACH s SLICE 1 IN ARRAY ARRAY[
    ARRAY['portal_belge', 'olusturan_kisi_id', 'kisi', 'portal_belge_olusturan_kisi_id_fk'],
    ARRAY['portal_belge', 'guncelleyen_kisi_id', 'kisi', 'portal_belge_guncelleyen_kisi_id_fk'],
    ARRAY['portal_ek', 'yukleyen_kisi_id', 'kisi', 'portal_ek_yukleyen_kisi_id_fk'],
    ARRAY['portal_siparis_bagi', 'teklif_id', 'siparisler_teklif', 'portal_siparis_bagi_teklif_id_fk'],
    ARRAY['portal_siparis_bagi', 'siparis_id', 'siparisler_siparis', 'portal_siparis_bagi_siparis_id_fk']
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
