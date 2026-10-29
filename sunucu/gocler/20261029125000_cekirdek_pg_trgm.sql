-- Genel aramanın (Ctrl K) "içinde geçen" eşleşmesi (LIKE '%x%') trigram GIN indeksiyle hızlanır (1231 a). pg_trgm PostgreSQL'le
-- gelen ve PG13'ten beri güvenilir (trusted) uzantıdır: veritabanında CREATE hakkı olan göç kullanıcısı kurar, veri değişmez.
-- Uzantı veritabanı başına tektir; public şemasına kurulur ki her şema (test şemaları dahil) aynı op sınıfını görsün.
-- Modül göçleri ifade indeksini şemasıyla yazar: CREATE INDEX ... USING gin (public.arama_sade(sutun) public.gin_trgm_ops).
--
-- Türkçe harf eşlemesi veritabanının dil ayarına bırakılmaz (C.UTF-8'de 'IŞIK' ILIKE 'ışık' yanlıştır). Sütun ve sorgu aynı
-- tabloyla sadeleşir; tablo paylasilan/kayit-aramasi.ts'teki SADE_KAYNAK / SADE_HEDEF ile aynıdır ve testle denetlenir.
-- lower() kullanılmaz: dil ayarına bağlıdır, indeks ifadesi değişmez olmalıdır.
--
-- Göç her test şemasında yeniden ve aynı anda koşabilir; uzantı ve işlev veritabanında tektir. Yarışı kaybeden koşu
-- kazananın kurduğunu kullanır.
DO $goc$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    RAISE EXCEPTION 'pg_trgm uzantısı bu PostgreSQL kurulumunda yok; contrib paketi kurulup göç yeniden koşulmalı';
  END IF;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pg_trgm') IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'pg_trgm public şemasında değil (%); indeksler public.gin_trgm_ops bekler',
      (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'pg_trgm');
  END IF;
  IF to_regprocedure('public.arama_sade(text)') IS NULL THEN
    BEGIN
      CREATE FUNCTION public.arama_sade(metin text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
        AS $islev$ SELECT pg_catalog.translate(metin, 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİıÖŞÜçğöşüÂâÎîÛû', 'abcdefghijklmnopqrstuvwxyzcgiiosucgosuaaiiuu') $islev$;
    EXCEPTION WHEN duplicate_function OR unique_violation THEN
      NULL;
    END;
  END IF;
END $goc$;
