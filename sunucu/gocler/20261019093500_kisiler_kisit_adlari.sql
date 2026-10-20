-- Rol ve kişi kısıtlarına PostgreSQL'in verdiği adlar yerine okunur ad (kural: kısıtlar adlandırılır). Veri değişmez.
-- Eski ad yoksa (elle adlandırılmış) o satır atlanır; göç durmaz.
DO $$
DECLARE
  k record;
BEGIN
  FOR k IN SELECT * FROM (VALUES
    ('rol', 'rol_kod_key', 'rol_kod_tek'),
    ('rol', 'rol_kod_check', 'rol_kod_bicimi'),
    ('rol', 'rol_ad_check', 'rol_ad_bos_degil'),
    ('kisi', 'kisi_ad_check', 'kisi_ad_bos_degil'),
    ('kisi', 'kisi_kullanici_adi_check', 'kisi_kullanici_adi_bicimi')
  ) AS v (tablo, eski, yeni)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.oid = to_regclass(k.tablo) AND c.conname = k.eski
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', k.tablo, k.eski, k.yeni);
    END IF;
  END LOOP;
END
$$;
