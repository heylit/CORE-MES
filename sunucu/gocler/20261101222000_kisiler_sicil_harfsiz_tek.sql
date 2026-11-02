-- KIS-2 (karar KIS-2 a, teyit a): sicil no büyük-küçük harften bağımsız tekildir; "T-001" ile "t-001" aynı sicildir.
-- Var olan veri değişmez. Harf farkıyla çift sicil varsa göç durur ve yalnız kişi kimliklerini yazar (sicil ve ad günlüğe
-- düşmez); çiftler elle ayrıldıktan sonra göç yeniden çalıştırılır. Dizin adı aynı kalır: sunucu çakışmayı bu adla tanır.
-- Geri alma: dizin eski biçimiyle (kisi (sicil_no)) yeniden kurulur; veri silinmez.
DO $$
DECLARE
  ciftler text;
BEGIN
  SELECT string_agg(k.id::text, ', ' ORDER BY k.id) INTO ciftler
  FROM kisi k
  WHERE k.sicil_no IS NOT NULL
    AND EXISTS (SELECT 1 FROM kisi d WHERE d.id <> k.id AND d.sicil_no IS NOT NULL AND lower(d.sicil_no) = lower(k.sicil_no));
  IF ciftler IS NOT NULL THEN
    RAISE EXCEPTION 'Sicil no harf farkıyla çift olan kişiler (kimlik): %. Göç durdu; sicilleri ayırıp yeniden çalıştırın.', ciftler;
  END IF;
END $$;

DROP INDEX IF EXISTS kisi_sicil_no_tek;
CREATE UNIQUE INDEX IF NOT EXISTS kisi_sicil_no_tek ON kisi (lower(sicil_no)) WHERE sicil_no IS NOT NULL;
