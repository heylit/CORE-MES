-- Veritabanı kullanıcıları: göç kullanıcısı (tabloların sahibi) ve uygulama kullanıcısı (okur, yazar).
-- Süper kullanıcıyla, HER veritabanı için bir kez koşulur (asıl ve test); yeniden koşulabilir.
--   psql -1 -U postgres -d tmiv2 -f araclar/vt/kurulum.sql
-- -1 betiği tek transaction yapar: son satır "Kurulum tamam" değilse hiçbir şey değişmemiştir.
-- Parola depoya girmez. Etkileşimli kurulumda betikten sonra `\password tmiv2_goc` ve
-- `\password tmiv2_uygulama`; otomatik kurulumda `-v goc_parola=... -v uygulama_parola=...`
-- (bu yol parolayı sunucu günlüğüne düşürebilir; yalnız atılacak ortamlar içindir).
-- Parolası hiç verilmemiş rol parola doğrulamasıyla giriş yapamaz.
-- Betik herkese açık bağlanma hakkını yalnız bağlı veritabanında alır; öteki veritabanlarında bu hak
-- duruyorsa roller oralara bağlanabilir, kapatmak ayrı iştir.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() !~ '^tmiv2(_[a-z0-9_]+)?$' THEN
    RAISE EXCEPTION 'Bu betik yalnız tmiv2 veritabanlarında koşar; bağlı veritabanı: %', current_database();
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Bu betik süper kullanıcıyla koşar; bağlı kullanıcı: %', current_user;
  END IF;
  -- Veritabanının sahibi her şemayı ve tabloyu düşürebilir; uygulama rolü sahipse ayrım hiçbir şeyi korumaz.
  IF NOT (SELECT r.rolsuper OR r.rolname = 'tmiv2_goc' FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
          WHERE d.datname = current_database()) THEN
    RAISE EXCEPTION 'Veritabanının sahibi süper kullanıcı ya da tmiv2_goc olmalı; % veritabanının sahibi: %',
      current_database(), (SELECT datdba::regrole FROM pg_database WHERE datname = current_database());
  END IF;
END $$;

SELECT 'CREATE ROLE tmiv2_goc LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmiv2_goc') \gexec
SELECT 'CREATE ROLE tmiv2_uygulama LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tmiv2_uygulama') \gexec
-- Var olan rol de aynı kalıba çekilir: ikisi de süper kullanıcı değildir, veritabanı ve rol açamaz.
ALTER ROLE tmiv2_goc LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE tmiv2_uygulama LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\if :{?goc_parola}
ALTER ROLE tmiv2_goc PASSWORD :'goc_parola';
\endif
\if :{?uygulama_parola}
ALTER ROLE tmiv2_uygulama PASSWORD :'uygulama_parola';
\endif

DO $$
BEGIN
  IF pg_has_role('tmiv2_uygulama', 'tmiv2_goc', 'MEMBER') OR pg_has_role('tmiv2_goc', 'tmiv2_uygulama', 'MEMBER') THEN
    RAISE EXCEPTION 'tmiv2_goc ile tmiv2_uygulama birbirinin üyesi olamaz: üyelik sahipliği uygulamaya taşır';
  END IF;
END $$;

SELECT current_database() AS vt \gset

-- Veritabanına yalnız bu iki rol bağlanır; şemayı yalnız göç kullanıcısı açar.
REVOKE ALL ON DATABASE :"vt" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"vt" TO tmiv2_uygulama;
GRANT CONNECT, CREATE ON DATABASE :"vt" TO tmiv2_goc;

ALTER SCHEMA public OWNER TO tmiv2_goc;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tmiv2_uygulama;

-- Varsayılan yetkiler veritabanına özeldir: göç kullanıcısının bundan sonra açtığı her şema, tablo, dizi ve
-- işlevde uygulama kullanıcısı hakkını kendiliğinden alır. Göç dosyası ve göç koşucusu hak vermez.
-- Tek istisna göç kaydıdır (goc_kaydi): uygulama onu yalnız okur; yazma hakkını göç koşucusu ("npm run goc")
-- her koşuda geri alır, bu betikte ayrı adım yoktur.
-- TRUNCATE, REFERENCES ve TRIGGER verilmez; tabloyu düşürmek ve değiştirmek sahipliğe bağlıdır.
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc GRANT USAGE ON SCHEMAS TO tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc GRANT USAGE, SELECT ON SEQUENCES TO tmiv2_uygulama;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE tmiv2_goc GRANT EXECUTE ON FUNCTIONS TO tmiv2_uygulama;

-- Taşımanın içinden koşarken susar: taşıma sonradan hata verirse geri alınmış kurulum "tamam" dememiş olsun.
\if :{?tasima_icinden}
\else
\echo 'Kurulum tamam:' :vt
\endif
