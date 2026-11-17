-- Tek tarihle toplu sıfırlama (3395 ek, kullanıcı 17.11 11:52Z; kart cevabı 12:37Z "b) Kilitler de silinsin"): seçilen türlerde o gün
-- dahil o güne kadar açılmış bütün kökler Deneme işaretlenir ve tarihle seçilir. Bu yolda dış sistem kilitleri (Logo, SmartES, sevkiyat,
-- finans, etiket, tezgah okuma, izin listesi dışındaki silme kuralı) kalkar; denetim kaydı, tarihten sonraki (işaretsiz) kayda bağ,
-- bağlantısı boşalacak kayıt ve geri alınamayan stok kilidi kalır.

-- Açılış zamanı < gün + 1: o gün dahil, tesis saat diliminde (oturumun saat dilimi ne olursa olsun).
CREATE FUNCTION ayarlar_temizlik_tarih_kokleri(p_turler text[], p_bitis date)
RETURNS TABLE (tur text, kimlik bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT SET timezone = 'Europe/Istanbul' AS $$
  SELECT 'uretim_emri', e.id::bigint FROM uretim_emri e WHERE 'uretim_emri' = ANY(p_turler) AND e.acilma < p_bitis + 1
  UNION ALL
  SELECT 'siparis', s.id::bigint FROM siparisler_siparis s WHERE 'siparis' = ANY(p_turler) AND s.olusturma < p_bitis + 1
  UNION ALL
  SELECT 'malzeme', m.no::bigint FROM malzeme_katalog_karti m WHERE 'malzeme' = ANY(p_turler) AND m.acilma < p_bitis + 1
$$;

CREATE FUNCTION ayarlar_deneme_isaretle_tarihle(p_turler text[], p_bitis date, p_kisi int)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO ayarlar_deneme_isareti (tur, kimlik, isaretleyen_id)
  SELECT k.tur, k.kimlik, p_kisi FROM ayarlar_temizlik_tarih_kokleri(p_turler, p_bitis) k
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Tarihle işaret geri alınır (yanlış tarih): o güne kadar açılmış köklerin işareti kalkar, elle konmuş olanlar dahil.
CREATE FUNCTION ayarlar_deneme_isareti_kaldir_tarihle(p_turler text[], p_bitis date)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE n bigint;
BEGIN
  DELETE FROM ayarlar_deneme_isareti i USING ayarlar_temizlik_tarih_kokleri(p_turler, p_bitis) k WHERE i.tur = k.tur AND i.kimlik = k.kimlik;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- İşaretlemeden önce ekranın gösterdiği sayı: o güne kadar açılan ve bunlardan işaretli olan kök.
CREATE FUNCTION ayarlar_temizlik_tarih_sayisi(p_turler text[], p_bitis date, OUT toplam bigint, OUT isaretli bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT count(*), count(i.kimlik) FROM ayarlar_temizlik_tarih_kokleri(p_turler, p_bitis) k
  LEFT JOIN ayarlar_deneme_isareti i ON i.tur = k.tur AND i.kimlik = k.kimlik
$$;

-- Tarihle seçim: o güne kadar açılmış ve işaretli kökler. Sınırı aşan seçim açık iletiyle durur (tarih geri çekilir).
CREATE FUNCTION ayarlar_temizlik_tarih_secimi(p_turler text[], p_bitis date, p_sinir int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE secim jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tur', k.tur, 'kimlik', k.kimlik) ORDER BY k.tur, k.kimlik), '[]') INTO secim
  FROM ayarlar_temizlik_tarih_kokleri(p_turler, p_bitis) k
  WHERE EXISTS (SELECT FROM ayarlar_deneme_isareti i WHERE i.tur = k.tur AND i.kimlik = k.kimlik);
  IF jsonb_array_length(secim) > p_sinir THEN
    RAISE EXCEPTION 'Bu tarihe kadar % kayıt var; bir seferde en çok %. Tarihi geri çekip iki kez yapın.', jsonb_array_length(secim), p_sinir;
  END IF;
  RETURN secim;
END $$;

-- Tarihle sıfırlamada kalkan kilitler (kart 3395 ek b, madde 12'deki liste).
CREATE FUNCTION ayarlar_temizlik_atlanir_kilit(p_kilit text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT p_kilit IN ('Logo bağlantısı var', 'SmartES''e gitti', 'Sevkiyat kaydı var', 'Finans kaydı var (fatura, ödeme ya da maliyet)',
                     'Etiket kaydı var', 'Tezgah okuma kaydı var', 'Logo''ya gönderildi')
    OR p_kilit LIKE 'Silme kuralı var (%'
$$;

-- Etki, binlerce kökte birleşik kümeyi her kökte yeniden kurmasın: satırlar tek dizide toplanır, sonda bir kez gruplanır.
-- Sonuç (ve özet) önceki biçimle aynıdır: tablo -> sıralı, tekrarsız ctid listesi.
-- Tarihle yolda (p_bitis dolu) dış sistem kilitleri düşer; seçim o zaman dışarıdan alınmaz, tarihten burada kurulur: kilit düşürme
-- hiçbir çağrıda keyfi seçime uygulanamaz (Risk K-A). Seçerek yol p_secim verir, p_bitis boş kalır.
DROP FUNCTION ayarlar_temizlik_etkisi(jsonb);
CREATE FUNCTION ayarlar_temizlik_etkisi_kur(p_secim jsonb, p_turler text[], p_bitis date, p_sinir int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  p_tarihle boolean := p_bitis IS NOT NULL;
  secim jsonb := p_secim;
  s jsonb;
  k jsonb;
  kokler jsonb := '[]';
  hepsi text[] := '{}';
  birlesik jsonb;
  isaretli boolean;
BEGIN
  IF p_tarihle THEN
    IF p_secim IS NOT NULL THEN RAISE EXCEPTION 'Tarihle yolda seçim verilmez' USING ERRCODE = 'invalid_parameter_value'; END IF;
    secim := ayarlar_temizlik_tarih_secimi(p_turler, p_bitis, p_sinir);
    IF jsonb_array_length(secim) = 0 THEN RAISE EXCEPTION 'Bu tarihe kadar Deneme işaretli kayıt yok.'; END IF;
  END IF;
  FOR s IN SELECT jsonb_array_elements(secim) LOOP
    k := ayarlar_temizlik_kapsami(s ->> 'tur', (s ->> 'kimlik')::bigint);
    isaretli := EXISTS (SELECT FROM ayarlar_deneme_isareti WHERE tur = s ->> 'tur' AND kimlik = (s ->> 'kimlik')::bigint);
    IF NOT isaretli THEN k := jsonb_set(k, '{kilitler}', (k -> 'kilitler') || '"Deneme işareti yok"'); END IF;
    IF p_tarihle THEN
      k := jsonb_set(k, '{kilitler}', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(k -> 'kilitler') x WHERE NOT ayarlar_temizlik_atlanir_kilit(x)), '[]'));
    END IF;
    kokler := kokler || jsonb_build_array(jsonb_build_object(
      'tur', s ->> 'tur', 'kimlik', (s ->> 'kimlik')::bigint, 'no', k -> 'no', 'kilitler', k -> 'kilitler',
      'tablolar', coalesce((SELECT jsonb_object_agg(key, jsonb_array_length(value)) FROM jsonb_each(k -> 'satirlar')), '{}')));
    IF jsonb_array_length(k -> 'kilitler') = 0 THEN
      hepsi := hepsi || ARRAY(SELECT e.key || E'\t' || c FROM jsonb_each(k -> 'satirlar') e, jsonb_array_elements_text(e.value) c);
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_object_agg(t, cs), '{}') INTO birlesik FROM (
    SELECT split_part(x, E'\t', 1) AS t, jsonb_agg(DISTINCT split_part(x, E'\t', 2) ORDER BY split_part(x, E'\t', 2)) AS cs
    FROM unnest(hepsi) x GROUP BY 1
  ) g;
  RETURN jsonb_build_object(
    'kokler', kokler,
    'tablolar', coalesce((SELECT jsonb_object_agg(key, jsonb_array_length(value)) FROM jsonb_each(birlesik)), '{}'),
    'ozet', md5(birlesik::text),
    'satirlar', birlesik,
    'secim', secim);
END $$;

CREATE FUNCTION ayarlar_temizlik_etkisi(p_secim jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT ayarlar_temizlik_etkisi_kur(p_secim, NULL, NULL, NULL) - 'secim'
$$;

CREATE FUNCTION ayarlar_temizlik_etkisi_tarihle(p_turler text[], p_bitis date, p_sinir int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT ayarlar_temizlik_etkisi_kur(NULL, p_turler, p_bitis, p_sinir) - 'secim'
$$;

-- Temizlik tarihle de çağrılır: izin listesi dışındaki silme kuralı da kapanır, yabancı anahtarsız Logo kuyruğu satırı silinir.
-- Tarihle yolda seçim burada tarihten kurulur (etkiyle aynı çeviri); seçim ve tarih birlikte verilemez.
DROP FUNCTION ayarlar_veri_temizle(jsonb, text);
CREATE FUNCTION ayarlar_veri_temizle_kur(p_secim jsonb, p_turler text[], p_bitis date, p_sinir int, p_ozet text)
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

  FOR t IN SELECT unnest(kapali) LOOP EXECUTE t; END LOOP;
  DELETE FROM ayarlar_deneme_isareti i USING jsonb_array_elements(secim) s
  WHERE i.tur = s ->> 'tur' AND i.kimlik = (s ->> 'kimlik')::bigint;

  RETURN jsonb_build_object('tablolar', sayilar,
    'kokler', (SELECT jsonb_agg(jsonb_build_object('tur', x ->> 'tur', 'no', x -> 'no')) FROM jsonb_array_elements(etki -> 'kokler') x));
END $$;

CREATE FUNCTION ayarlar_veri_temizle(p_secim jsonb, p_ozet text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT ayarlar_veri_temizle_kur(p_secim, NULL, NULL, NULL, p_ozet)
$$;

CREATE FUNCTION ayarlar_veri_temizle_tarihle(p_turler text[], p_bitis date, p_sinir int, p_ozet text) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT ayarlar_veri_temizle_kur(NULL, p_turler, p_bitis, p_sinir, p_ozet)
$$;
