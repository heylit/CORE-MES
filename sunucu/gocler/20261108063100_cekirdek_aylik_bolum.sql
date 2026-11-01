-- Büyüyen yalnız-ekleme defterleri aylık bölümlenir (1765): zaman aralıklı okuma yalnız ilgili aylara bakar, eski bir ay
-- ileride tek tablo olarak ayrılabilir. Bölüm adı <tablo>_yYYYYmMM; ay sınırı UTC'dir ki oturumun saat dilimi bölümü
-- kaydırmasın. Hiçbir aya düşmeyen satır <tablo>_varsayilan bölümüne gider: bölüm açılmamış olsa da yazma düşmez.
-- Bölümü yalnız göç kullanıcısı açabilir (uygulama tablo açamaz); göç koşucusu her koşuda kayıtlı tabloların gelecek
-- aylarını açar (goc.ts aylikBolumleriHazirla).
CREATE TABLE cekirdek_aylik_bolum (
  tablo text PRIMARY KEY CONSTRAINT cekirdek_aylik_bolum_tablo_adi CHECK (tablo ~ '^[a-z_][a-z0-9_]{0,40}$'),
  sutun text NOT NULL CONSTRAINT cekirdek_aylik_bolum_sutun_adi CHECK (sutun ~ '^[a-z_][a-z0-9_]{0,62}$'),
  ileri_ay int NOT NULL CONSTRAINT cekirdek_aylik_bolum_ileri_ay CHECK (ileri_ay BETWEEN 1 AND 24)
);

-- Ana tablonun BEFORE TRUNCATE tetikleri bölüme kendiliğinden geçmez (satır tetikleri geçer); bölümü doğrudan boşaltmak
-- da yalnız-ekleme kuralına takılsın diye her bölüme aynı adla kurulur. Yeniden koşulabilir.
CREATE FUNCTION cekirdek_bolum_korumasi(p_tablo text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  ana regclass := to_regclass(quote_ident(p_tablo));
  t record;
BEGIN
  IF ana IS NULL THEN
    RAISE EXCEPTION 'cekirdek_bolum_korumasi: % tablosu yok', p_tablo;
  END IF;
  FOR t IN
    SELECT b.inhrelid::regclass AS bolum, tg.tgname, tg.tgfoid::regproc AS islev
      FROM pg_inherits b
      JOIN pg_trigger tg ON tg.tgrelid = ana AND NOT tg.tgisinternal
     WHERE b.inhparent = ana
       AND (tg.tgtype & 32) <> 0 AND (tg.tgtype & 2) <> 0 AND tg.tgnargs = 0
       AND NOT EXISTS (SELECT 1 FROM pg_trigger v WHERE v.tgrelid = b.inhrelid AND v.tgname = tg.tgname)
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION %s()', t.tgname, t.bolum, t.islev);
  END LOOP;
END $$;

-- Ayın bölümünü açar; açtıysa true. Varsayılan bölümde o aya düşen satır varsa bölüm açılamaz (PostgreSQL reddeder):
-- uyarı verir ve atlar, satırlar varsayılan bölümde kalır.
CREATE FUNCTION cekirdek_aylik_bolum_ac(p_tablo text, p_ay date) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  kayit cekirdek_aylik_bolum%ROWTYPE;
  ana regclass := to_regclass(quote_ident(p_tablo));
  ad text := format('%s_y%s', p_tablo, to_char(p_ay, 'YYYY"m"MM'));
  bas timestamptz := make_timestamptz(extract(year FROM p_ay)::int, extract(month FROM p_ay)::int, 1, 0, 0, 0, 'UTC');
  son timestamptz := make_timestamptz(extract(year FROM p_ay + interval '1 month')::int,
                                      extract(month FROM p_ay + interval '1 month')::int, 1, 0, 0, 0, 'UTC');
  varsayilan regclass := to_regclass(quote_ident(p_tablo || '_varsayilan'));
  dolu boolean := false;
BEGIN
  SELECT * INTO kayit FROM cekirdek_aylik_bolum WHERE tablo = p_tablo;
  IF NOT FOUND OR ana IS NULL THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolum_ac: % aylık bölümlü kayıtlı tablo değil', p_tablo;
  END IF;
  IF to_regclass(quote_ident(ad)) IS NOT NULL THEN
    RETURN false;
  END IF;
  IF varsayilan IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I >= $1 AND %I < $2)', varsayilan, kayit.sutun, kayit.sutun)
      INTO dolu USING bas, son;
  END IF;
  IF dolu THEN
    RAISE WARNING '% bölümü açılmadı: varsayılan bölümde bu aya düşen satır var', ad;
    RETURN false;
  END IF;
  EXECUTE format('CREATE TABLE %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)', ad, ana, bas, son);
  PERFORM cekirdek_bolum_korumasi(p_tablo);
  RETURN true;
END $$;

-- Kayıtlı tabloların geçen ay, bu ay ve ileri_ay kadar gelecek ayın bölümünü açar; açılan bölüm sayısını döner.
CREATE FUNCTION cekirdek_aylik_bolumleri_hazirla(p_tablo text DEFAULT NULL) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  kayit cekirdek_aylik_bolum%ROWTYPE;
  bu_ay timestamp := date_trunc('month', now() AT TIME ZONE 'UTC');
  acilan int := 0;
BEGIN
  FOR kayit IN SELECT * FROM cekirdek_aylik_bolum WHERE p_tablo IS NULL OR tablo = p_tablo ORDER BY tablo LOOP
    FOR i IN -1 .. kayit.ileri_ay LOOP
      IF cekirdek_aylik_bolum_ac(kayit.tablo, (bu_ay + make_interval(months => i))::date) THEN
        acilan := acilan + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN acilan;
END $$;

-- Dolu, bölümsüz tabloyu aynı adla aylık bölümlü tabloya çevirir; satırlar ve kimlik dizisinin yeri korunur.
-- Birincil anahtara bölüm sütunu eklenir (PostgreSQL, bölümlü tabloda tekilliği bölüm sütunu olmadan tutamaz).
-- Taşınanlar: varsayılan değer, kimlik, NOT NULL ve CHECK kısıtları, dizinler, dışa giden yabancı anahtarlar, tetikler.
-- Tabloya gelen yabancı anahtar ya da birincil anahtar dışında tekil kısıt varsa durur: onları çağıran göç önce çözer.
CREATE FUNCTION cekirdek_aylik_bolume_cevir(p_tablo text, p_sutun text, p_ileri_ay int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  ana regclass := to_regclass(quote_ident(p_tablo));
  eski text := p_tablo || '_bolumsuz';
  pk_adi text;
  pk_sutunlari text;
  dizinler text[];
  yabancilar text[];
  tetikler text[];
  kimlikler text[];
  s text;
  dizi text;
  son_deger bigint;
  cagrildi boolean;
  ay date;
BEGIN
  IF ana IS NULL THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolume_cevir: % tablosu yok', p_tablo;
  END IF;
  IF (SELECT relkind FROM pg_class WHERE oid = ana) <> 'r' THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolume_cevir: % düz tablo değil (zaten bölümlü olabilir)', p_tablo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = ana AND contype = 'f') THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolume_cevir: % tablosuna gelen yabancı anahtar var; önce çağıran göç kaldırmalı', p_tablo;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index WHERE indrelid = ana AND indisunique AND NOT indisprimary) THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolume_cevir: % tablosunda birincil anahtar dışında tekil dizin var; önce çağıran göç çözmeli', p_tablo;
  END IF;

  SELECT c.conname, string_agg(quote_ident(a.attname), ', ' ORDER BY k.n)
    INTO pk_adi, pk_sutunlari
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, n)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   WHERE c.conrelid = ana AND c.contype = 'p'
   GROUP BY c.conname;
  IF pk_adi IS NULL THEN
    RAISE EXCEPTION 'cekirdek_aylik_bolume_cevir: % tablosunda birincil anahtar yok', p_tablo;
  END IF;

  -- Tanımlar adı değişmeden okunur: tablo aynı adla yeniden açılınca olduğu gibi koşulur.
  SELECT coalesce(array_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid), '{}') INTO dizinler
    FROM pg_index WHERE indrelid = ana AND NOT indisprimary;
  SELECT coalesce(array_agg(format('ALTER TABLE %s ADD CONSTRAINT %I %s', ana, conname, pg_get_constraintdef(oid)) ORDER BY conname), '{}')
    INTO yabancilar FROM pg_constraint WHERE conrelid = ana AND contype = 'f';
  SELECT coalesce(array_agg(pg_get_triggerdef(oid) ORDER BY tgname), '{}') INTO tetikler
    FROM pg_trigger WHERE tgrelid = ana AND NOT tgisinternal;
  SELECT coalesce(array_agg(attname::text ORDER BY attnum), '{}') INTO kimlikler
    FROM pg_attribute WHERE attrelid = ana AND attidentity <> '' AND NOT attisdropped;

  EXECUTE format('ALTER TABLE %s RENAME TO %I', ana, eski);
  -- Kimlik dizisinin adı tablo adından türer; yeni tablo aynı adı alabilsin diye eski dizi de yeniden adlandırılır.
  FOREACH s IN ARRAY kimlikler LOOP
    dizi := pg_get_serial_sequence(quote_ident(eski), s);
    EXECUTE format('ALTER SEQUENCE %s RENAME TO %I', dizi, left(eski || '_' || s || '_seq', 63));
  END LOOP;

  EXECUTE format(
    'CREATE TABLE %I (LIKE %I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING IDENTITY INCLUDING GENERATED INCLUDING STORAGE INCLUDING COMMENTS) PARTITION BY RANGE (%I)',
    p_tablo, eski, p_sutun);
  INSERT INTO cekirdek_aylik_bolum (tablo, sutun, ileri_ay) VALUES (p_tablo, p_sutun, p_ileri_ay);
  EXECUTE format('CREATE TABLE %I PARTITION OF %I DEFAULT', p_tablo || '_varsayilan', p_tablo);
  FOR ay IN EXECUTE format('SELECT DISTINCT date_trunc(''month'', %I AT TIME ZONE ''UTC'')::date FROM %I WHERE %I IS NOT NULL ORDER BY 1', p_sutun, eski, p_sutun)
  LOOP
    PERFORM cekirdek_aylik_bolum_ac(p_tablo, ay);
  END LOOP;
  PERFORM cekirdek_aylik_bolumleri_hazirla(p_tablo);

  EXECUTE format('INSERT INTO %I OVERRIDING SYSTEM VALUE SELECT * FROM %I', p_tablo, eski);
  FOREACH s IN ARRAY kimlikler LOOP
    EXECUTE format('SELECT last_value, is_called FROM %s', pg_get_serial_sequence(quote_ident(eski), s)) INTO son_deger, cagrildi;
    PERFORM setval(pg_get_serial_sequence(quote_ident(p_tablo), s), son_deger, cagrildi);
  END LOOP;
  EXECUTE format('DROP TABLE %I', eski);

  IF NOT (p_sutun = ANY (string_to_array(replace(pk_sutunlari, ' ', ''), ','))) THEN
    pk_sutunlari := pk_sutunlari || ', ' || quote_ident(p_sutun);
  END IF;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY (%s)', p_tablo, pk_adi, pk_sutunlari);
  FOREACH s IN ARRAY dizinler LOOP EXECUTE s; END LOOP;
  FOREACH s IN ARRAY yabancilar LOOP EXECUTE s; END LOOP;
  FOREACH s IN ARRAY tetikler LOOP EXECUTE s; END LOOP;
  PERFORM cekirdek_bolum_korumasi(p_tablo);
  EXECUTE format('ANALYZE %I', p_tablo);
END $$;

-- Bölümde tetiklenen ret iletisi bölümü değil defteri adlandırsın: kullanıcı ve günlük "<tablo>_y2026m11" değil "<tablo>" görür.
CREATE OR REPLACE FUNCTION yalniz_ekleme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır',
    (SELECT relname FROM pg_class WHERE oid = coalesce(pg_partition_root(TG_RELID), TG_RELID));
END $$;
