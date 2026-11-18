-- "Sıfırdan başla" (3426 a): uygulama verisi ilk kurulum haline döner. Hangi tablonun kalacağını uygulama söyler (kurallar.ts),
-- silmeyi bu işlevler göç rolünün haklarıyla yapar: yalnız eklenen defterlerin tetikleri işlem süresince kapanır.
-- Yarıda kalan iş yoktur: bir bağ çözülemezse bütün işlem geri döner.
-- Denetim izi (ADR 0002, ADR 0005) ve göç kaydı her zaman kalır; uygulama ne isterse istesin bu işlevler onlara dokunmaz (3426 denetim a).

-- Kalan tablodaki satır, silinen satıra bağlıysa bağ çözülür: sütun boş olabiliyorsa boşaltılır, olamıyorsa satır silinir.
-- Kişiye bağlar bu kurala girmez: kalan satırın gösterdiği kişi pasif ve girişsiz kalır (denetim izi ve tanımlar adını korur).
CREATE FUNCTION ayarlar_sifirlama_kosulu(p_tablo text, p_takma text, p_silinen text[], p_kismi text[], p_rol_kismi boolean, p_yonetici int)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT CASE
    WHEN p_tablo = ANY(p_silinen) THEN 'false'
    WHEN p_tablo = ANY(p_kismi) THEN format('%I.kisi_id = %s', p_takma, p_yonetici)
    WHEN p_tablo = 'rol' AND p_rol_kismi THEN format('%I.yerlesik', p_takma)
    ELSE 'true'
  END
$$;

-- Kısmi tablo yalnız yöneticinin satırlarını korur (kisi_id); kişi tablosunun kendisi işlevde ayrıca ele alınır.
CREATE FUNCTION ayarlar_sifirlama_kapsami(p_kalan text[], p_kismi text[],
  OUT tum text[], OUT silinen text[], OUT kismi text[])
LANGUAGE plpgsql STABLE SET search_path FROM CURRENT AS $$
DECLARE
  bilinmeyen text;
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO tum FROM pg_class c
   WHERE c.relnamespace = current_schema()::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition;
  SELECT x INTO bilinmeyen FROM unnest(p_kalan || p_kismi) x WHERE NOT x = ANY(tum) LIMIT 1;
  IF bilinmeyen IS NOT NULL THEN
    RAISE EXCEPTION 'Sıfırlama listesinde bilinmeyen tablo: %', bilinmeyen;
  END IF;
  SELECT x INTO bilinmeyen FROM unnest(p_kismi) x WHERE x = ANY(ARRAY['goc_kaydi', 'denetim_kaydi', 'denetim_degisiklik', 'okuma_kaydi']) LIMIT 1;
  IF bilinmeyen IS NOT NULL THEN
    RAISE EXCEPTION 'Sıfırlama denetim izine ve göç kaydına dokunmaz: %', bilinmeyen;
  END IF;
  kismi := array(SELECT x FROM unnest(p_kismi) x WHERE NOT x = ANY(p_kalan) ORDER BY x);
  silinen := array(
    SELECT x FROM unnest(tum) x
     WHERE NOT x = ANY(ARRAY['goc_kaydi', 'kisi', 'denetim_kaydi', 'denetim_degisiklik', 'okuma_kaydi']) AND NOT x = ANY(p_kalan) AND NOT x = ANY(kismi)
     ORDER BY x);
END;
$$;

-- Ekranın gösterdiği sayılar: tablo başına silinecek satır (kişide silinecek ya da pasifleşecek). Bağ çözme satırları sayılmaz.
CREATE FUNCTION ayarlar_sifirlama_sayilari(p_kalan text[], p_kismi text[], p_kisiler_kalsin boolean, p_yonetici int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  k record;
  t text;
  n bigint;
  sonuc jsonb := '{}';
BEGIN
  SELECT * INTO k FROM ayarlar_sifirlama_kapsami(p_kalan, p_kismi);
  FOREACH t IN ARRAY k.silinen LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n > 0 THEN sonuc := sonuc || jsonb_build_object(t, n); END IF;
  END LOOP;
  FOREACH t IN ARRAY k.kismi LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE kisi_id <> $1', t) INTO n USING p_yonetici;
    IF n > 0 THEN sonuc := sonuc || jsonb_build_object(t, n); END IF;
  END LOOP;
  IF NOT p_kisiler_kalsin THEN
    SELECT count(*) INTO n FROM kisi WHERE id <> p_yonetici;
    IF n > 0 THEN sonuc := sonuc || jsonb_build_object('kisi', n); END IF;
    SELECT count(*) INTO n FROM rol WHERE NOT yerlesik;
    IF n > 0 THEN sonuc := sonuc || jsonb_build_object('rol', n); END IF;
  END IF;
  RETURN sonuc;
END;
$$;

CREATE FUNCTION ayarlar_sifirdan_basla(p_kalan text[], p_kismi text[], p_kisiler_kalsin boolean, p_yonetici int)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  k record;
  t text;
  trg record;
  fk record;
  kapali text[] := '{}';
  hayatta text[];
  kaybeden text[];
  sirali text[] := '{}';
  kalan_sil text[];
  ilerledi boolean;
  tur int := 0;
  degisen bigint;
  n bigint;
  kosul text;
  esitlik text;
  dolu text;
  bos_olur boolean;
  sayilar jsonb := '{}';
  cozulen jsonb := '{}';
  yonetici_rolu int;
  gevsek boolean := false;
  gevsetilen text[] := '{}';
  e_a text[];
  e_b text[];
  e_ad text[];
BEGIN
  -- Süre sınırı isteğin sorgu sınırıdır (TMIV2_PG_SORGU_SURE_MS); aşılırsa işlem bütünüyle geri döner, hiçbir şey silinmez.
  PERFORM set_config('lock_timeout', '10s', true);
  IF NOT EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol r ON r.id = kr.rol_id WHERE kr.kisi_id = p_yonetici AND r.yonetici) THEN
    RAISE EXCEPTION 'Sıfırlamayı yalnız sistem yöneticisi yapar.';
  END IF;
  SELECT * INTO k FROM ayarlar_sifirlama_kapsami(p_kalan, p_kismi);
  hayatta := array(SELECT x FROM unnest(k.tum) x WHERE NOT x = ANY(k.silinen));
  kaybeden := k.silinen || k.kismi || CASE WHEN p_kisiler_kalsin THEN '{}'::text[] ELSE ARRAY['rol'] END;

  -- Kalan tablolar da yazılır (bağ çözme); kayıtlı defter tetikleri bu işlemde hiçbir tabloda çalışmaz.
  FOREACH t IN ARRAY k.tum LOOP
    CONTINUE WHEN t = ANY(ARRAY['goc_kaydi', 'denetim_kaydi', 'denetim_degisiklik', 'okuma_kaydi']);
    FOR trg IN SELECT g.tgname, g.tgenabled FROM pg_trigger g
        WHERE g.tgrelid = t::regclass AND NOT g.tgisinternal AND g.tgparentid = 0 AND g.tgenabled IN ('O', 'A') LOOP
      EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', t, trg.tgname);
      kapali := kapali || format('ALTER TABLE %I ENABLE %sTRIGGER %I', t, CASE WHEN trg.tgenabled = 'A' THEN 'ALWAYS ' ELSE '' END, trg.tgname);
    END LOOP;
  END LOOP;

  IF NOT p_kisiler_kalsin THEN
    SELECT id INTO yonetici_rolu FROM rol WHERE kod = 'yonetici' AND yerlesik;
    IF yonetici_rolu IS NULL THEN RAISE EXCEPTION 'Yerleşik yönetici rolü bulunamadı.'; END IF;
    UPDATE kisi SET kullanici_adi = NULL, parola_ozeti = NULL, aktif = false WHERE id <> p_yonetici;
    INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES (p_yonetici, yonetici_rolu) ON CONFLICT DO NOTHING;
  END IF;

  -- Bağ çözme, bir tur hiçbir satır değişmeyene kadar tekrarlanır: satır silmek başka kalan satırın bağını koparabilir.
  LOOP
    tur := tur + 1;
    IF tur > 20 THEN RAISE EXCEPTION 'Sıfırlamada bağlar çözülemedi.'; END IF;
    ilerledi := false;
    FOR fk IN
      SELECT c.conname, c.conrelid::regclass::text AS a, c.confrelid::regclass::text AS b,
             array(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n ORDER BY i) AS ac,
             array(SELECT attname::text FROM unnest(c.confkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.confrelid AND attnum = u.n ORDER BY i) AS bc,
             NOT EXISTS (SELECT 1 FROM unnest(c.conkey) u(n) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n WHERE attnotnull) AS bos_olur
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace AND c.conparentid = 0
         AND c.conrelid::regclass::text = ANY(hayatta) AND c.confrelid::regclass::text = ANY(kaybeden)
    LOOP
      esitlik := (SELECT string_agg(format('b.%I = a.%I', fk.bc[i], fk.ac[i]), ' AND ') FROM generate_subscripts(fk.ac, 1) i);
      dolu := (SELECT string_agg(format('a.%I IS NOT NULL', x), ' AND ') FROM unnest(fk.ac) x);
      kosul := format('%s AND NOT EXISTS (SELECT 1 FROM %I b WHERE %s AND %s) AND %s', dolu, fk.b, esitlik,
        ayarlar_sifirlama_kosulu(fk.b, 'b', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici),
        ayarlar_sifirlama_kosulu(fk.a, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici));
      IF fk.bos_olur THEN
        -- Boşaltmayı bir kısıt (ör. istasyon konumu istasyonsuz olamaz) reddederse satır bağıyla birlikte gider.
        BEGIN
          EXECUTE format('UPDATE %I a SET %s WHERE %s', fk.a, (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x), kosul);
        EXCEPTION WHEN check_violation OR not_null_violation THEN
          EXECUTE format('DELETE FROM %I a WHERE %s', fk.a, kosul);
        END;
      ELSE
        EXECUTE format('DELETE FROM %I a WHERE %s', fk.a, kosul);
      END IF;
      GET DIAGNOSTICS degisen = ROW_COUNT;
      IF degisen > 0 THEN
        ilerledi := true;
        cozulen := cozulen || jsonb_build_object(fk.a, coalesce((cozulen ->> fk.a)::bigint, 0) + degisen);
      END IF;
    END LOOP;
    EXIT WHEN NOT ilerledi;
  END LOOP;

  -- Silme sırası: çocuk önce. Döngüde kalan tablolarda boş olabilen bağlar silinecek satırlarda boşaltılıp sıra yeniden kurulur;
  -- boş olamayan bağ döngüsü varsa açık iletiyle durulur (yarım silme yok, işlem geri döner).
  -- Bağlar katalogdan bir kez okunur; sıra bellekte kurulur (tablo başına katalog sorgusu yüzlerce tabloda saniyeler sürer).
  SELECT coalesce(array_agg(c.conrelid::regclass::text), '{}'), coalesce(array_agg(c.confrelid::regclass::text), '{}'), coalesce(array_agg(c.oid::text), '{}')
    INTO e_a, e_b, e_ad
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.conparentid = 0 AND c.conrelid <> c.confrelid
     AND c.conrelid::regclass::text = ANY(kaybeden) AND c.confrelid::regclass::text = ANY(kaybeden);
  kalan_sil := kaybeden;
  WHILE cardinality(kalan_sil) > 0 LOOP
    ilerledi := false;
    FOREACH t IN ARRAY kalan_sil LOOP
      IF NOT EXISTS (SELECT 1 FROM unnest(e_a, e_b, e_ad) u(a, b, ad)
                      WHERE u.b = t AND u.a = ANY(kalan_sil) AND NOT u.ad = ANY(gevsetilen)) THEN
        sirali := sirali || t;
        kalan_sil := array_remove(kalan_sil, t);
        ilerledi := true;
      END IF;
    END LOOP;
    IF NOT ilerledi THEN
      IF gevsek THEN RAISE EXCEPTION 'Sıfırlamada silme sırası kurulamadı: %', array_to_string(kalan_sil, ', '); END IF;
      gevsek := true;
      FOR fk IN
        SELECT c.oid::text AS ad, c.conrelid::regclass::text AS a,
               array(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n ORDER BY i) AS ac
          FROM pg_constraint c
         WHERE c.contype = 'f' AND c.conparentid = 0 AND c.conrelid <> c.confrelid
           AND c.conrelid::regclass::text = ANY(kalan_sil) AND c.confrelid::regclass::text = ANY(kalan_sil)
           AND NOT EXISTS (SELECT 1 FROM unnest(c.conkey) u(n) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n WHERE attnotnull)
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I a SET %s WHERE NOT (%s) AND (%s)', fk.a,
            (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x),
            ayarlar_sifirlama_kosulu(fk.a, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici),
            (SELECT string_agg(format('a.%I IS NOT NULL', x), ' OR ') FROM unnest(fk.ac) x));
          gevsetilen := gevsetilen || fk.ad;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY sirali LOOP
    EXECUTE format('DELETE FROM %I a WHERE NOT (%s)', t,
      ayarlar_sifirlama_kosulu(t, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici));
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN sayilar := sayilar || jsonb_build_object(t, n); END IF;
  END LOOP;

  -- Kişi: yönetici kalır; kalan bir satırın gösterdiği kişi pasif ve girişsiz kalır, ötekiler silinir.
  IF NOT p_kisiler_kalsin THEN
    kosul := coalesce((
      SELECT string_agg(format('NOT EXISTS (SELECT 1 FROM %I r WHERE r.%I = k.id)', c.conrelid::regclass::text, a.attname), ' AND ')
        FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f' AND c.conparentid = 0 AND c.confrelid = 'kisi'::regclass AND cardinality(c.conkey) = 1
         AND c.conrelid::regclass::text = ANY(hayatta)), 'true');
    EXECUTE format('DELETE FROM kisi k WHERE k.id <> $1 AND %s', kosul) USING p_yonetici;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN sayilar := sayilar || jsonb_build_object('kisi', n); END IF;
  END IF;

  FOREACH t IN ARRAY kapali LOOP EXECUTE t; END LOOP;
  RETURN jsonb_build_object('tablolar', sayilar, 'cozulen', cozulen);
END;
$$;
