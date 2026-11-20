-- "Sıfırdan başla" canlıda iki hatayla duruyordu (3464): kullanıcılar kalmayınca PIN'li kişi girişsiz kalamıyordu (23514
-- kisi_pin_giris_ister); silme sırası için bağ gevşetilirken aynı emrin refakat partileri stok_parti_emir_tek'e çarpıyordu (23505).
-- Yalnız işlevler değişir; tablo ve veri değişmez.

CREATE OR REPLACE FUNCTION ayarlar_sifirlama_dal_sil(p_tablo text, p_satirlar tid[], p_kaybeden text[], p_derinlik int)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path FROM CURRENT AS $$
DECLARE
  fk record;
  cocuk tid[];
  esitlik text;
  sonuc jsonb := '{}';
  n bigint;
BEGIN
  IF p_derinlik > 30 THEN RAISE EXCEPTION 'Sıfırlamada bağlı satırlar çözülemedi: %', p_tablo; END IF;
  IF cardinality(p_satirlar) = 0 THEN RETURN sonuc; END IF;
  FOR fk IN
    SELECT c.conrelid::regclass::text AS a,
           array(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n ORDER BY i) AS ac,
           array(SELECT attname::text FROM unnest(c.confkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.confrelid AND attnum = u.n ORDER BY i) AS bc,
           NOT EXISTS (SELECT 1 FROM unnest(c.conkey) u(n) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n WHERE attnotnull) AS bos_olur
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.conparentid = 0 AND c.confrelid = p_tablo::regclass
  LOOP
    esitlik := (SELECT string_agg(format('p.%I = a.%I', fk.bc[i], fk.ac[i]), ' AND ') FROM generate_subscripts(fk.ac, 1) i);
    EXECUTE format('SELECT coalesce(array_agg(a.ctid), ''{}'') FROM %I a WHERE EXISTS (SELECT 1 FROM %I p WHERE p.ctid = ANY($1) AND %s)%s',
      fk.a, p_tablo, esitlik, CASE WHEN fk.a = p_tablo THEN ' AND NOT a.ctid = ANY($1)' ELSE '' END) INTO cocuk USING p_satirlar;
    CONTINUE WHEN cardinality(cocuk) = 0;
    IF fk.a = ANY(ARRAY['goc_kaydi', 'denetim_kaydi', 'denetim_degisiklik', 'okuma_kaydi']) THEN
      RAISE EXCEPTION 'Sıfırlama denetim izine ve göç kaydına dokunmaz: % satırı % tablosuna bağlı.', fk.a, p_tablo;
    END IF;
    IF fk.bos_olur AND NOT fk.a = ANY(p_kaybeden) THEN
      BEGIN
        EXECUTE format('UPDATE %I a SET %s WHERE a.ctid = ANY($1)', fk.a, (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x)) USING cocuk;
        GET DIAGNOSTICS n = ROW_COUNT;
        sonuc := ayarlar_sifirlama_topla(sonuc, jsonb_build_object(fk.a, n));
        CONTINUE;
      EXCEPTION WHEN check_violation OR not_null_violation OR unique_violation THEN NULL;
      END;
    END IF;
    sonuc := ayarlar_sifirlama_topla(sonuc, ayarlar_sifirlama_dal_sil(fk.a, cocuk, p_kaybeden, p_derinlik + 1));
    EXECUTE format('DELETE FROM %I a WHERE a.ctid = ANY($1)', fk.a) USING cocuk;
    GET DIAGNOSTICS n = ROW_COUNT;
    sonuc := ayarlar_sifirlama_topla(sonuc, jsonb_build_object(fk.a, n));
  END LOOP;
  RETURN sonuc;
END;
$$;

CREATE OR REPLACE FUNCTION ayarlar_sifirdan_basla(p_kalan text[], p_kismi text[], p_kisiler_kalsin boolean, p_yonetici int)
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
  sil boolean;
  satirlar tid[];
  dal jsonb;
  tek record;
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
    -- PIN girişe bağlıdır (kisi_pin_giris_ister): giriş kalkınca PIN de kalkar.
    UPDATE kisi SET kullanici_adi = NULL, parola_ozeti = NULL, pin_ozeti = NULL, pin_belirlenecek = false, aktif = false WHERE id <> p_yonetici;
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
      degisen := 0;
      sil := NOT fk.bos_olur;
      IF fk.bos_olur THEN
        -- Boşaltmayı bir kısıt (ör. istasyon konumu istasyonsuz olamaz) reddederse satır bağıyla birlikte gider.
        BEGIN
          EXECUTE format('UPDATE %I a SET %s WHERE %s', fk.a, (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x), kosul);
          GET DIAGNOSTICS degisen = ROW_COUNT;
        EXCEPTION WHEN check_violation OR not_null_violation OR unique_violation THEN
          sil := true;
        END;
      END IF;
      IF sil THEN
        -- Silinen kalan satıra bağlı satırlar (ör. konumdaki stok hareketi) önce çözülür; yoksa silme bağ ihlaliyle durur.
        EXECUTE format('SELECT coalesce(array_agg(a.ctid), ''{}'') FROM %I a WHERE %s', fk.a, kosul) INTO satirlar;
        dal := ayarlar_sifirlama_dal_sil(fk.a, satirlar, kaybeden, 1);
        sayilar := ayarlar_sifirlama_topla(sayilar, (SELECT coalesce(jsonb_object_agg(d.key, d.value), '{}') FROM jsonb_each(dal) d WHERE d.key = ANY(kaybeden)));
        cozulen := ayarlar_sifirlama_topla(cozulen, (SELECT coalesce(jsonb_object_agg(d.key, d.value), '{}') FROM jsonb_each(dal) d WHERE NOT d.key = ANY(kaybeden)));
        EXECUTE format('DELETE FROM %I a WHERE a.ctid = ANY($1)', fk.a) USING satirlar;
        GET DIAGNOSTICS degisen = ROW_COUNT;
      END IF;
      IF degisen > 0 THEN
        ilerledi := true;
        cozulen := ayarlar_sifirlama_topla(cozulen, jsonb_build_object(fk.a, degisen));
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
      -- Tablonun bütün boş olabilen bağları tek deyimde boşaltılır: tek tek boşaltmada ara durum kısmi benzersiz dizine
      -- (ör. stok_parti_emir_tek: refakat partisi boşalınca aynı emrin iki partisi çakışır, 23505) ya da denetime takılır.
      -- Toplu boşaltma reddedilirse bağlar tek tek denenir; reddedilen bağ gevşetilmez.
      FOR fk IN
        SELECT c.conrelid::regclass::text AS a, array_agg(c.oid::text) AS adlar,
               array_agg(DISTINCT x.attname::text) AS ac
          FROM pg_constraint c
          JOIN LATERAL unnest(c.conkey) u(n) ON true
          JOIN pg_attribute x ON x.attrelid = c.conrelid AND x.attnum = u.n
         WHERE c.contype = 'f' AND c.conparentid = 0 AND c.conrelid <> c.confrelid
           AND c.conrelid::regclass::text = ANY(kalan_sil) AND c.confrelid::regclass::text = ANY(kalan_sil)
           AND NOT EXISTS (SELECT 1 FROM unnest(c.conkey) v(n) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = v.n WHERE attnotnull)
         GROUP BY c.conrelid
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I a SET %s WHERE NOT (%s) AND (%s)', fk.a,
            (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x),
            ayarlar_sifirlama_kosulu(fk.a, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici),
            (SELECT string_agg(format('a.%I IS NOT NULL', x), ' OR ') FROM unnest(fk.ac) x));
          gevsetilen := gevsetilen || fk.adlar;
        EXCEPTION WHEN check_violation OR unique_violation THEN
          FOR tek IN
            SELECT c.oid::text AS ad,
                   array(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY u(n, i) JOIN pg_attribute ON attrelid = c.conrelid AND attnum = u.n ORDER BY i) AS ac
              FROM pg_constraint c WHERE c.oid::text = ANY(fk.adlar)
          LOOP
            BEGIN
              EXECUTE format('UPDATE %I a SET %s WHERE NOT (%s) AND (%s)', fk.a,
                (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(tek.ac) x),
                ayarlar_sifirlama_kosulu(fk.a, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici),
                (SELECT string_agg(format('a.%I IS NOT NULL', x), ' OR ') FROM unnest(tek.ac) x));
              gevsetilen := gevsetilen || tek.ad;
            EXCEPTION WHEN check_violation OR unique_violation THEN NULL;
            END;
          END LOOP;
        END;
      END LOOP;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY sirali LOOP
    EXECUTE format('DELETE FROM %I a WHERE NOT (%s)', t,
      ayarlar_sifirlama_kosulu(t, 'a', k.silinen, k.kismi, NOT p_kisiler_kalsin, p_yonetici));
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN sayilar := ayarlar_sifirlama_topla(sayilar, jsonb_build_object(t, n)); END IF;
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
    IF n > 0 THEN sayilar := ayarlar_sifirlama_topla(sayilar, jsonb_build_object('kisi', n)); END IF;
  END IF;

  -- Ertelenmiş kısıt olayı bekleyen tabloda ALTER TABLE yapılamaz (55006): denetimler tetikler açılmadan koşar.
  SET CONSTRAINTS ALL IMMEDIATE;
  FOREACH t IN ARRAY kapali LOOP EXECUTE t; END LOOP;
  RETURN jsonb_build_object('tablolar', sayilar, 'cozulen', cozulen);
END;
$$;
