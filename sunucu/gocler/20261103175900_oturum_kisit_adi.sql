-- oturum.anahtar_ozeti UNIQUE kısıtına PostgreSQL'in verdiği ad yerine okunur ad (kural: kısıtlar adlandırılır). Veri değişmez.
-- Eski ad yoksa (elle adlandırılmış) göç atlanır; durmaz.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = to_regclass('oturum') AND c.conname = 'oturum_anahtar_ozeti_key'
  ) THEN
    ALTER TABLE oturum RENAME CONSTRAINT oturum_anahtar_ozeti_key TO oturum_anahtar_ozeti_tek;
  END IF;
END
$$;
