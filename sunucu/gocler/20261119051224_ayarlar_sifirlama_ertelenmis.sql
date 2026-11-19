-- "Sıfırdan başla" örnek veriyle 500 veriyordu (3433): ertelenmiş kısıt olayı bekleyen tabloda tetik yeniden
-- açılamıyordu (55006) ve silinen kalan satıra bağlı satır (ör. konumdaki stok hareketi) silmeyi bağ ihlaliyle durduruyordu.
-- Tetikler açılmadan ertelenmiş denetimler koşar (tarihle temizlik de); kalan satır silinirken ona bağlı satırlar önce çözülür.

-- Sayı nesnelerini anahtar anahtar toplar (aynı tablo birden çok bağdan gelebilir).
CREATE FUNCTION ayarlar_sifirlama_topla(p_a jsonb, p_b jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT coalesce(jsonb_object_agg(x.key, x.toplam), '{}')
    FROM (SELECT key, sum(value::bigint) AS toplam FROM (SELECT * FROM jsonb_each_text(p_a) UNION ALL SELECT * FROM jsonb_each_text(p_b)) y GROUP BY key) x
$$;

-- Silinecek satırlara bağlı satırlar: kalan tabloda boş olabilen bağ boşaltılır, olmazsa ya da tablo siliniyorsa satır
-- kendi bağlılarıyla birlikte silinir (çocuk önce). Denetim izi ve göç kaydına bağlı satır varsa işlem geri döner.
CREATE FUNCTION ayarlar_sifirlama_dal_sil(p_tablo text, p_satirlar tid[], p_kaybeden text[], p_derinlik int)
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
      EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
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
-- Yalnız göç rolünün sıfırlama işlevinden çağrılır; uygulama doğrudan çağıramaz.
REVOKE EXECUTE ON FUNCTION ayarlar_sifirlama_dal_sil(text, tid[], text[], int) FROM PUBLIC, tmiv2_uygulama;

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
      degisen := 0;
      sil := NOT fk.bos_olur;
      IF fk.bos_olur THEN
        -- Boşaltmayı bir kısıt (ör. istasyon konumu istasyonsuz olamaz) reddederse satır bağıyla birlikte gider.
        BEGIN
          EXECUTE format('UPDATE %I a SET %s WHERE %s', fk.a, (SELECT string_agg(format('%I = NULL', x), ', ') FROM unnest(fk.ac) x), kosul);
          GET DIAGNOSTICS degisen = ROW_COUNT;
        EXCEPTION WHEN check_violation OR not_null_violation THEN
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

-- Tarihle temizlik de aynı tetik kapatma kalıbını kullanır.
CREATE OR REPLACE FUNCTION ayarlar_veri_temizle_kur(p_secim jsonb, p_turler text[], p_bitis date, p_sinir int, p_ozet text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  p_tarihle boolean := p_bitis IS NOT NULL;
  secim jsonb := p_secim;
  etki jsonb;
  k jsonb;
  kalan jsonb;
  t text;
  trg record;
  kapali text[] := '{}';
  n bigint;
  ilerledi boolean;
  sayilar jsonb := '{}';
  sec jsonb;
  kok regclass;
  anahtar text;
  st record;
  b record;
  kalan_ayar numeric;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '300s', true);
  IF p_tarihle THEN
    IF p_secim IS NOT NULL THEN RAISE EXCEPTION 'Tarihle yolda seçim verilmez' USING ERRCODE = 'invalid_parameter_value'; END IF;
    secim := ayarlar_temizlik_tarih_secimi(p_turler, p_bitis, p_sinir);
    IF jsonb_array_length(secim) = 0 THEN RAISE EXCEPTION 'Bu tarihe kadar Deneme işaretli kayıt yok.'; END IF;
  END IF;
  IF jsonb_typeof(secim) IS DISTINCT FROM 'array' OR jsonb_array_length(secim) = 0 THEN
    RAISE EXCEPTION 'Seçim boş' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Kökler etkiden önce kilitlenir: arada başka işlem köke yeni bağlı satır ekleyemez (kümede olmayan çocuk sessizce gitmesin).
  FOR sec IN SELECT jsonb_array_elements(secim) LOOP
    SELECT k.tablo, k.anahtar INTO kok, anahtar FROM ayarlar_temizlik_koku(sec ->> 'tur') k;
    IF kok IS NOT NULL THEN EXECUTE format('SELECT 1 FROM %s WHERE %I = $1 FOR UPDATE', kok, anahtar) USING (sec ->> 'kimlik')::bigint; END IF;
  END LOOP;
  etki := ayarlar_temizlik_etkisi_kur(CASE WHEN p_tarihle THEN NULL ELSE secim END, p_turler, p_bitis, p_sinir);
  IF etki -> 'secim' IS DISTINCT FROM secim THEN RAISE EXCEPTION 'Etki değişti; etkiyi yeniden görün'; END IF;
  FOR k IN SELECT jsonb_array_elements(etki -> 'kokler') LOOP
    IF jsonb_array_length(k -> 'kilitler') > 0 THEN
      RAISE EXCEPTION 'Kilitli kayıt temizlenmez: % (%)', k ->> 'no', k -> 'kilitler' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF etki ->> 'ozet' IS DISTINCT FROM p_ozet THEN
    RAISE EXCEPTION 'Etki değişti; etkiyi yeniden görün';
  END IF;

  FOR t IN SELECT jsonb_object_keys(etki -> 'satirlar') LOOP
    FOR trg IN SELECT g.tgname, p.proname FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid
        WHERE g.tgrelid = t::regclass AND NOT g.tgisinternal AND g.tgenabled = 'O'
        AND (g.tgtype & 1) <> 0 AND (g.tgtype & 2) <> 0 AND (g.tgtype & 8) <> 0 LOOP
      IF NOT p_tarihle AND NOT ayarlar_temizlik_kapanir_tetik(trg.proname) THEN
        RAISE EXCEPTION 'Silme kuralı kapatılamaz: % (%)', t, trg.proname USING ERRCODE = 'check_violation';
      END IF;
      EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', t, trg.tgname);
      kapali := kapali || format('ALTER TABLE %s ENABLE TRIGGER %I', t, trg.tgname);
    END LOOP;
  END LOOP;

  -- Stok: silinen hareketlerin etkisi kümedışı bakiyeden düşülür, sonra hareket ve kümedeki bakiye silinir. Bakiye-defter eşitlik
  -- tetiği bu işlemde kapanır: eşitliği işlev kendisi kurar (kümedışı bakiye + silinen bakiye - silinen hareket etkisi).
  IF etki -> 'satirlar' ? 'stok_hareketi' OR etki -> 'satirlar' ? 'stok_bakiye' THEN
    FOR trg IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'stok_bakiye'::regclass AND NOT tgisinternal AND tgenabled = 'O'
        AND tgname IN ('stok_bakiye_defter_topla', 'stok_bakiye_defter_esit') LOOP
      EXECUTE format('ALTER TABLE stok_bakiye DISABLE TRIGGER %I', trg.tgname);
      kapali := kapali || format('ALTER TABLE stok_bakiye ENABLE TRIGGER %I', trg.tgname);
    END LOOP;
    FOR st IN SELECT * FROM ayarlar_temizlik_stok_etkisi(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(etki -> 'satirlar' -> 'stok_hareketi', '[]')))::tid[],
        ARRAY(SELECT jsonb_array_elements_text(coalesce(etki -> 'satirlar' -> 'stok_bakiye', '[]')))::tid[]) LOOP
      IF NOT st.karsilanir THEN
        RAISE EXCEPTION 'Stok bakiyesi geri alınamaz: malzeme %, konum %', st.malzeme_id, st.konum_id USING ERRCODE = 'check_violation';
      END IF;
      kalan_ayar := -st.ayar;
      FOR b IN SELECT x.id, x.miktar FROM stok_bakiye x
          WHERE x.malzeme_id = st.malzeme_id AND x.konum_id = st.konum_id AND x.parti_id IS NOT DISTINCT FROM st.parti_id
            AND x.statu_id IS NOT DISTINCT FROM st.statu_id AND x.kalite_durumu = st.kalite_durumu
            AND NOT (x.ctid::text IN (SELECT jsonb_array_elements_text(coalesce(etki -> 'satirlar' -> 'stok_bakiye', '[]'))))
          ORDER BY x.id DESC FOR UPDATE LOOP
        EXIT WHEN kalan_ayar <= 0;
        IF b.miktar <= kalan_ayar THEN
          DELETE FROM stok_bakiye WHERE id = b.id;
          kalan_ayar := kalan_ayar - b.miktar;
        ELSE
          UPDATE stok_bakiye SET miktar = miktar - kalan_ayar WHERE id = b.id;
          kalan_ayar := 0;
        END IF;
      END LOOP;
      IF kalan_ayar > 0 THEN RAISE EXCEPTION 'Stok bakiyesi yetmedi: malzeme %', st.malzeme_id USING ERRCODE = 'check_violation'; END IF;
    END LOOP;
  END IF;

  -- Tarihle sıfırlamada (kart 3395 ek, b) dış sisteme gitmiş kayıt da gider; yabancı anahtarsız Logo kuyruğu satırı da silinir ki
  -- kuyruk olmayan belgeyi aramasın. Logo'daki karşılık yerinde kalır.
  IF p_tarihle THEN
    FOR b IN SELECT * FROM ayarlar_temizlik_fk_siz_baglar() x WHERE etki -> 'satirlar' ? x.hedef AND to_regclass(x.kaynak) IS NOT NULL LOOP
      EXECUTE format('DELETE FROM %1$I g USING %2$s h WHERE g.belge_no = h.%3$I AND h.ctid = ANY($1::tid[]) AND ($2::text[] IS NULL OR g.belge_turu = ANY($2))',
        b.kaynak, b.hedef::regclass, b.sutun)
        USING ARRAY(SELECT jsonb_array_elements_text(etki -> 'satirlar' -> b.hedef)), b.turler;
    END LOOP;
  END IF;

  kalan := etki -> 'satirlar';
  LOOP
    EXIT WHEN kalan = '{}'::jsonb;
    ilerledi := false;
    FOR t IN SELECT jsonb_object_keys(kalan) ORDER BY 1 LOOP
      BEGIN
        EXECUTE format('DELETE FROM %s WHERE ctid = ANY($1::tid[])', t) USING ARRAY(SELECT jsonb_array_elements_text(kalan -> t));
        kalan := kalan - t;
        ilerledi := true;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;
      END;
    END LOOP;
    IF NOT ilerledi THEN
      RAISE EXCEPTION 'Bağlı kayıtlar sıralanamadı: %', (SELECT string_agg(x, ', ') FROM jsonb_object_keys(kalan) x);
    END IF;
  END LOOP;

  FOR t IN SELECT jsonb_object_keys(etki -> 'satirlar') LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE ctid = ANY($1::tid[])', t) INTO n
      USING ARRAY(SELECT jsonb_array_elements_text(etki -> 'satirlar' -> t));
    IF n > 0 THEN RAISE EXCEPTION 'Silinmeyen satır kaldı: % (%)', t, n; END IF;
    sayilar := sayilar || jsonb_build_object(t, jsonb_array_length(etki -> 'satirlar' -> t));
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;
  FOR t IN SELECT unnest(kapali) LOOP EXECUTE t; END LOOP;
  DELETE FROM ayarlar_deneme_isareti i USING jsonb_array_elements(secim) s
  WHERE i.tur = s ->> 'tur' AND i.kimlik = (s ->> 'kimlik')::bigint;

  RETURN jsonb_build_object('tablolar', sayilar,
    'kokler', (SELECT jsonb_agg(jsonb_build_object('tur', x ->> 'tur', 'no', x -> 'no')) FROM jsonb_array_elements(etki -> 'kokler') x));
END $$;
