-- Vardiya adı büyük/küçük harf ve boşluk farkıyla da tekildir (kart 1847, VRD-7): "Gündüz", "gündüz" ve "Gündüz " matriste aynı kısa adla
-- görünür, ayırt edilemez. Var olan çift ad varsa göç durur ve çiftlerin kimliklerini yazar: veri silinmez, adlar elle ayrılıp göç yeniden çalıştırılır.
DO $$
DECLARE
  ciftler text;
BEGIN
  SELECT string_agg(idler, '; ') INTO ciftler FROM (
    SELECT string_agg(id::text, ', ' ORDER BY id) AS idler
    FROM vardiya
    GROUP BY lower(regexp_replace(btrim(ad), '\s+', ' ', 'g'))
    HAVING count(*) > 1
  ) c;
  IF ciftler IS NOT NULL THEN
    RAISE EXCEPTION 'Büyük/küçük harf ya da boşluk farkıyla aynı adlı vardiyalar var (vardiya id): %. Adları ayırıp göçü yeniden çalıştırın.', ciftler;
  END IF;
END $$;

CREATE UNIQUE INDEX vardiya_ad_tekil_harfsiz ON vardiya (lower(regexp_replace(btrim(ad), '\s+', ' ', 'g')));
