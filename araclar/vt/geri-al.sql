-- Taşımanın geri alınması: sahiplik bağlı süper kullanıcıya döner, varsayılan yetkiler ve uygulama
-- kullanıcısının hakları kalkar, veritabanı yeniden herkese açılır. Süper kullanıcıyla, HER veritabanı için
-- bir kez koşulur; yeniden koşulabilir.
-- Betikten sonra elle yapılacaklar:
--   1. .env eski değerlerine döner: TMIV2_PG_USER ve TMIV2_PG_PASSWORD yeniden sahibin (süper kullanıcının)
--      kimliğidir. Uygulama kullanıcısının artık hiçbir tabloda hakkı yoktur; .env onda kalırsa her sorgu
--      izin hatası verir. İki ayrı kullanıcı isteyen kod sürümü de geri alınır: tek kullanıcıyla açılmaz.
--   2. Roller silinmez. tmiv2_goc iki veritabanı da geri alındıktan sonra `DROP ROLE tmiv2_goc` ile silinir.
--      tmiv2_uygulama'nın veritabanına bağlanma hakkı (kurulumdan önce de olabilir) yerinde kalır; bu yüzden
--      `DROP ROLE tmiv2_uygulama` reddedilir. Silinecekse önce her veritabanı için
--      `REVOKE ALL ON DATABASE <ad> FROM tmiv2_uygulama`.
--   psql -1 -U postgres -d tmiv2 -f araclar/vt/geri-al.sql
-- -1 betiği tek transaction yapar: son satır "Geri alma tamam" değilse hiçbir şey değişmemiştir.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() !~ '^tmiv2(_[a-z0-9_]+)?$' THEN
    RAISE EXCEPTION 'Bu betik yalnız tmiv2 veritabanlarında koşar; bağlı veritabanı: %', current_database();
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Bu betik süper kullanıcıyla koşar; bağlı kullanıcı: %', current_user;
  END IF;
END $$;

SELECT current_database() AS vt \gset
SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmiv2_goc') AS goc_var,
       EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmiv2_uygulama') AS uygulama_var \gset

\if :goc_var
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc REVOKE USAGE ON SCHEMAS FROM tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc REVOKE ALL ON TABLES FROM tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc REVOKE ALL ON SEQUENCES FROM tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc REVOKE EXECUTE ON FUNCTIONS FROM tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
REASSIGN OWNED BY tmiv2_goc TO CURRENT_USER;
REVOKE ALL ON DATABASE :"vt" FROM tmiv2_goc;
\endif

DO $$
DECLARE
  n record;
BEGIN
  FOR n IN SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmiv2_uygulama') THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM tmiv2_uygulama', n.nspname);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM tmiv2_uygulama', n.nspname);
      EXECUTE format('REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM tmiv2_uygulama', n.nspname);
      EXECUTE format('REVOKE ALL ON SCHEMA %I FROM tmiv2_uygulama', n.nspname);
    END IF;
    EXECUTE format('GRANT EXECUTE ON ALL ROUTINES IN SCHEMA %I TO PUBLIC', n.nspname);
  END LOOP;
END $$;

-- PostgreSQL'in yeni veritabanındaki varsayılanları: public şeması veritabanı sahibinindir ve herkes
-- kullanır; veritabanına herkes bağlanır ve geçici tablo açar.
ALTER SCHEMA public OWNER TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"vt" TO PUBLIC;

\echo 'Geri alma tamam:' :vt
