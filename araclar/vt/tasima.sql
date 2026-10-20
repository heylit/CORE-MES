-- Tek kullanıcılı kurulumdan taşıma: eski sahibin şema, tablo, dizi ve işlevleri göç kullanıcısına geçer,
-- var olan nesnelerde uygulama kullanıcısına hak verilir (göç kaydı goc_kaydi'nda yalnız okuma). Süper kullanıcıyla, HER veritabanı için bir kez
-- koşulur; yeniden koşulabilir. Önce kurulum.sql'i kendisi koşar.
--   psql -1 -U postgres -d tmiv2 -f araclar/vt/tasima.sql
--   psql -1 -U postgres -d tmiv2_test -v t_semalarini_sil=1 -f araclar/vt/tasima.sql
-- -1 betiği tek transaction yapar: son satır "Taşıma tamam" değilse hiçbir şey değişmemiştir.
-- eski_sahip verilmezse bağlı kullanıcıdır. Başka rolün nesnesine dokunulmaz; kalan olursa betik hata verir.
-- t_semalarini_sil YALNIZ test veritabanında verilir: t_ ile başlayan bütün şemaları içindekilerle siler.
\set ON_ERROR_STOP on

\if :{?t_semalarini_sil}
-- Asıl veritabanında t_ ile başlayan şema test artığı değil, gerçek veri olabilir; bayrak orada hiçbir işe başlamadan durur.
DO $$
BEGIN
  IF current_database() !~ '^tmiv2_' THEN
    RAISE EXCEPTION 't_semalarini_sil yalnız test veritabanında (adı tmiv2_ ile başlayan) verilir; bağlı veritabanı: %', current_database();
  END IF;
END $$;
\endif

\set tasima_icinden 1
\ir kurulum.sql

\if :{?eski_sahip}
\else
SELECT current_user AS eski_sahip \gset
\endif
SELECT set_config('tmiv2.eski_sahip', :'eski_sahip', false) AS eski_sahip;

\if :{?t_semalarini_sil}
-- Eski sahibin bıraktığı test şemalarını göç kullanıcısı silemez; taşımak yerine atılır.
DO $$
DECLARE
  n record;
BEGIN
  FOR n IN SELECT nspname FROM pg_namespace WHERE left(nspname, 2) = 't_' LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', n.nspname);
  END LOOP;
END $$;
\endif

DO $$
DECLARE
  eski oid := (SELECT oid FROM pg_roles WHERE rolname = current_setting('tmiv2.eski_sahip'));
  n record;
BEGIN
  IF eski IS NULL THEN
    RAISE EXCEPTION 'eski_sahip rolü yok: %', current_setting('tmiv2.eski_sahip');
  END IF;

  FOR n IN
    SELECT nspname FROM pg_namespace
    WHERE nspowner = eski AND nspname !~ '^pg_' AND nspname <> 'information_schema'
  LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO tmiv2_goc', n.nspname);
  END LOOP;

  -- Sütuna bağlı dizi (serial, identity) tablosuyla birlikte geçer; tek başına sahibi değiştirilemez.
  FOR n IN
    SELECT c.oid::regclass::text AS ad
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE c.relowner = eski AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT (c.relkind = 'S' AND EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
    ORDER BY c.relkind = 'S', c.oid
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO tmiv2_goc', n.ad);
  END LOOP;

  FOR n IN
    SELECT p.oid::regprocedure::text AS ad
    FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
    WHERE p.proowner = eski AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO tmiv2_goc', n.ad);
  END LOOP;

  FOR n IN
    SELECT t.oid::regtype::text AS ad, t.typtype
    FROM pg_type t JOIN pg_namespace s ON s.oid = t.typnamespace
    WHERE t.typowner = eski AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
      AND t.typtype IN ('e', 'd')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO tmiv2_goc', CASE n.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, n.ad);
  END LOOP;

  -- Var olan nesneler varsayılan yetkilerden yararlanmaz (onlar yalnız sonradan açılana işler).
  FOR n IN
    SELECT nspname FROM pg_namespace
    WHERE nspowner = 'tmiv2_goc'::regrole AND nspname !~ '^pg_' AND nspname <> 'information_schema'
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO tmiv2_uygulama', n.nspname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO tmiv2_uygulama', n.nspname);
    -- Göç kaydını uygulama yalnız okur; toplu hak onu da açtığı için burada geri alınır (göç koşucusu da her koşuda alır).
    IF to_regclass(format('%I.goc_kaydi', n.nspname)) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I.goc_kaydi FROM tmiv2_uygulama', n.nspname);
    END IF;
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO tmiv2_uygulama', n.nspname);
    EXECUTE format('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', n.nspname);
    EXECUTE format('GRANT EXECUTE ON ALL ROUTINES IN SCHEMA %I TO tmiv2_uygulama', n.nspname);
  END LOOP;
END $$;

-- Göç kullanıcısının olmayan her nesne adıyla söylenir: sessizce yarım kalan taşıma, ilk göçte patlar.
DO $$
DECLARE
  kalan text;
BEGIN
  SELECT string_agg(ad, ', ' ORDER BY ad) INTO kalan FROM (
    SELECT 'şema ' || nspname AS ad FROM pg_namespace
      WHERE nspowner <> 'tmiv2_goc'::regrole AND nspname !~ '^pg_' AND nspname <> 'information_schema'
    UNION ALL
    SELECT 'ilişki ' || c.oid::regclass::text FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE c.relowner <> 'tmiv2_goc'::regrole AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
    UNION ALL
    SELECT 'işlev ' || p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE p.proowner <> 'tmiv2_goc'::regrole AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
    UNION ALL
    SELECT 'tip ' || t.oid::regtype::text FROM pg_type t JOIN pg_namespace s ON s.oid = t.typnamespace
      WHERE t.typowner <> 'tmiv2_goc'::regrole AND s.nspname !~ '^pg_' AND s.nspname <> 'information_schema'
  ) nesneler;
  IF kalan IS NOT NULL THEN
    RAISE EXCEPTION 'Sahibi tmiv2_goc olmayan nesne kaldı: %', kalan;
  END IF;
END $$;

\echo 'Taşıma tamam:' :vt
