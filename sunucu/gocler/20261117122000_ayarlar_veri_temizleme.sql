-- İşlevler göç rolünün haklarıyla koşar (SECURITY DEFINER); arama yolu göçün koştuğu şemaya sabitlenir (FROM CURRENT).
-- Deneme verisi temizleme (3395 a): yalnız "Deneme" işaretli kök kayıt ve ona bağlı kayıtlar, göç rolüne ait tek işlevle silinir;
-- uygulama rolü değişmez defterlerin kilidini kendisi açamaz (ADR 0005). Gerçek kayda dokunan, dış sisteme gitmiş ya da denetim
-- izi taşıyan kök kilitlidir ve hiç silinmez.

-- Kök kayıt (üretim emri, sipariş, malzeme kartı) silinmeden önce bu tabloda işaretlenir. Kökün kendisine yabancı anahtar yoktur:
-- işaret kök silinince işlevle birlikte gider; kök başka yoldan silinemez (defter tetikleri).
CREATE TABLE ayarlar_deneme_isareti (
  tur text NOT NULL CONSTRAINT ayarlar_deneme_isareti_tur CHECK (tur IN ('uretim_emri', 'siparis', 'malzeme')),
  kimlik bigint NOT NULL,
  isaretleyen_id int NOT NULL REFERENCES kisi,
  isaretleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tur, kimlik)
);

-- Kök türünün tablosu ve anahtar sütunu. Malzeme kartına bağlı tablolar kartın sayı numarasına (no) bağlanır.
CREATE FUNCTION ayarlar_temizlik_koku(p_tur text, OUT tablo regclass, OUT anahtar text)
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT v.tablo::regclass, v.anahtar FROM (VALUES
    ('uretim_emri', 'uretim_emri', 'id'),
    ('siparis', 'siparisler_siparis', 'id'),
    ('malzeme', 'malzeme_katalog_karti', 'no')
  ) AS v(tur, tablo, anahtar) WHERE v.tur = p_tur
$$;

-- Bağlı kayıt kümesi dış sisteme ya da kalıcı ize dokunuyorsa kök kilitlidir. Tablo adındaki sözcükle tanınır (siparisler_logo_gonderim,
-- malzeme_logo_karsiligi gibi başka modülün tablosu da): yeni bir Logo, SmartES, sevkiyat, finans, etiket, tezgah ya da denetim
-- tablosu da kendiliğinden kilit sayılır. Yanlış kilit temizliği durdurur, eksik kilit gerçek izi silerdi: geniş tutulur.
CREATE FUNCTION ayarlar_temizlik_kilit_etiketi(p_tablo text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT CASE
    WHEN p_tablo LIKE '%logo%' THEN 'Logo bağlantısı var'
    WHEN p_tablo LIKE '%smartes%' THEN 'SmartES''e gitti'
    WHEN p_tablo LIKE '%sevkiyat%' THEN 'Sevkiyat kaydı var'
    WHEN p_tablo LIKE '%finans%' THEN 'Finans kaydı var (fatura, ödeme ya da maliyet)'
    WHEN p_tablo LIKE '%etiket%' THEN 'Etiket kaydı var'
    WHEN p_tablo LIKE '%tezgah\_baglantisi%' THEN 'Tezgah okuma kaydı var'
    WHEN p_tablo LIKE '%denetim%' THEN 'Denetim kaydı var'
  END
$$;

-- Silmeyi engelleyen satır tetiğinin (BEFORE DELETE) yalnız değişmezlik koruması olanları temizlikte kapanır (3395 Risk K4). Listede
-- olmayan tetik iş kuralı taşıyabilir (satın alma silme kuralı, sevkiyat onayı gibi): o tabloya dokunan kök kilitlidir.
CREATE FUNCTION ayarlar_temizlik_kapanir_tetik(p_islev text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT p_islev = ANY (ARRAY[
    'yalniz_ekleme', 'ik_kayit_koru', 'ik_bes_hareket_koru', 'malzeme_katalog_karti_koru', 'emir_adimi_degismez', 'kalite_merkezi_iz_degismez',
    'plan_senaryo_satiri_korunur', 'plan_planlama_kaydi_gecmisi_silinmez', 'plan_senaryo_degisikligi_silinmez', 'plan_senaryosu_korunur',
    'rota_icerik_kilitli', 'rota_sartname_surumu_kilitli', 'rota_tanimi_kilitli', 'rota_revizyon_kilitli', 'rota_adim_sartnamesi_kilitli',
    'recete_rota_kayit_gecmisi_silinmez', 'cnc_kurulum_kayit_gecmisi_silinmez', 'belge_merkezi_revizyon_degismez',
    'uretim_emirleri_hatali_kaydi_karar_bir_kez', 'atolye_silinmez', 'atolye_model_parca_yazimi', 'atolye_kroki_parca_yazimi',
    'arkon_anomali_kesin_korumasi'
  ])
$$;

-- Yabancı anahtarsız dış sistem bağları (3395 Risk K1): Logo kuyruğu belgeyi tür ve sayı kimliğiyle tutar. Logo'da kaydı açılmış ya da
-- açılmış olabilecek (niyet yazılmış, sonucu belirsiz) belge kilitlidir; yalnız kuyrukta bekleyen kilitsizdir.
-- Eşleme: malzeme/hizmet kartı -> malzeme_katalog_karti.no, satış teklif ve siparişi -> siparisler_logo_gonderim.id,
-- satın alma siparişi -> satin_alma_siparis.id, talep ve karşılama -> satin_alma_talep.id, proje -> projeler_proje.id, malzeme fişleri ->
-- stok_malzeme_fisi.id.
CREATE FUNCTION ayarlar_temizlik_fk_siz_baglar(OUT kaynak text, OUT turler text[], OUT hedef text, OUT sutun text)
RETURNS SETOF record LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  VALUES
    ('logo_giden', ARRAY['malzeme', 'hizmet', 'malzeme-guncelleme'], 'malzeme_katalog_karti', 'no'),
    ('logo_giden', ARRAY['siparisler-teklifi', 'siparisler-siparisi'], 'siparisler_logo_gonderim', 'id'),
    ('logo_giden', ARRAY['siparis', 'siparis-guncelleme', 'siparis-kapatma', 'siparis-bekletme', 'siparis-iptal'], 'satin_alma_siparis', 'id'),
    ('logo_giden', ARRAY['talep', 'karsilama'], 'satin_alma_talep', 'id'),
    ('logo_giden', ARRAY['proje'], 'projeler_proje', 'id'),
    ('logo_malzeme_fisi_giden', NULL::text[], 'stok_malzeme_fisi', 'id')
$$;

-- Silinecek hareketlerin anahtar başına bakiyeye etkisi (hedefe +, kaynaktan -; fark) ve bakiyede yapılacak düzeltme. Kümedeki bakiye
-- satırları (silinecek) c, kümedışı satırlar r toplar; temizlikten sonra anahtarın toplamı (r + c) - fark olmalı, yani kümedışı
-- satırlara ayar = c - fark eklenir. Eksi ayar karşılanabilir (r yeterse); artı ayar silinen hareketin gerçek stoktan düştüğünü
-- gösterir, bakiye geri yazılamaz: karşılanmaz.
CREATE FUNCTION ayarlar_temizlik_stok_etkisi(p_hareketler tid[], p_bakiyeler tid[])
RETURNS TABLE (malzeme_id int, konum_id int, parti_id bigint, statu_id int, kalite_durumu text, ayar numeric, kalan numeric, karsilanir boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  WITH etki AS (
    SELECT h.malzeme_id, h.hedef_konum_id AS konum_id, h.parti_id, h.hedef_statu_id AS statu_id, coalesce(h.hedef_kalite_durumu, 'serbest') AS kalite_durumu, h.miktar AS fark
    FROM stok_hareketi h WHERE h.ctid = ANY(p_hareketler) AND h.hedef_konum_id IS NOT NULL
    UNION ALL
    SELECT h.malzeme_id, h.kaynak_konum_id, h.parti_id, h.kaynak_statu_id, coalesce(h.kaynak_kalite_durumu, 'serbest'), -h.miktar
    FROM stok_hareketi h WHERE h.ctid = ANY(p_hareketler) AND h.kaynak_konum_id IS NOT NULL
  ), net AS (
    SELECT e.malzeme_id, e.konum_id, e.parti_id, e.statu_id, e.kalite_durumu, sum(e.fark) AS fark FROM etki e GROUP BY 1, 2, 3, 4, 5
  ), hesap AS (
    SELECT n.*, coalesce(b.r, 0) AS r, coalesce(b.c, 0) AS c FROM net n LEFT JOIN LATERAL (
      SELECT sum(b.miktar) FILTER (WHERE NOT (b.ctid = ANY(p_bakiyeler))) AS r, sum(b.miktar) FILTER (WHERE b.ctid = ANY(p_bakiyeler)) AS c
      FROM stok_bakiye b
      WHERE b.malzeme_id = n.malzeme_id AND b.konum_id = n.konum_id AND b.parti_id IS NOT DISTINCT FROM n.parti_id
        AND b.statu_id IS NOT DISTINCT FROM n.statu_id AND b.kalite_durumu = n.kalite_durumu
    ) b ON true
  )
  SELECT h.malzeme_id, h.konum_id, h.parti_id, h.statu_id, h.kalite_durumu, h.c - h.fark, h.r, h.c - h.fark <= 0 AND h.r + (h.c - h.fark) >= 0
  FROM hesap h WHERE h.c - h.fark <> 0
$$;

-- Verilen adlı tam sayı sütunu olup o sütunda yabancı anahtarı olmayan tablolar (bu şemada). Metin sütun (stok kodu gibi) başka şey taşır.
CREATE FUNCTION ayarlar_temizlik_fk_siz_cocuklar(p_sutun text, OUT cocuk regclass)
RETURNS SETOF regclass LANGUAGE sql STABLE SET search_path FROM CURRENT AS $$
  SELECT r.oid::regclass FROM pg_class r
  JOIN pg_attribute a ON a.attrelid = r.oid AND a.attname = p_sutun AND NOT a.attisdropped AND a.atttypid IN ('int4'::regtype, 'int8'::regtype)
  WHERE r.relkind = 'r' AND r.relnamespace = current_schema()::regnamespace
    AND NOT EXISTS (SELECT FROM pg_constraint k WHERE k.contype = 'f' AND k.conrelid = r.oid AND a.attnum = ANY(k.conkey))
  ORDER BY 1
$$;

-- Bir kök kaydın bağlı kayıt kümesi: kökten aşağı, yabancı anahtar yönünde (çocuk tablolara) gidilir; ON DELETE SET NULL ve
-- SET DEFAULT bağları izlenmez (o çocuk yaşar). Satırlar ctid ile tutulur; kümenin özeti ctid'leri de kapsar: arada güncellenen
-- satırın ctid'i değişir ve özet tutmaz (3395 K7).
-- Dönen: {satirlar: {tablo: [ctid]}, kilitler: [neden], no: görünen numara}. Kök yoksa kilitler "Kayıt yok" taşır.
CREATE FUNCTION ayarlar_temizlik_kapsami(p_tur text, p_kimlik bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  kok regclass;
  anahtar text;
  kok_ctid text;
  kok_no text;
  ziyaret jsonb := '{}';
  kuyruk jsonb;
  oge jsonb;
  baba text;
  fk record;
  kosul text;
  yeni text[];
  onceki text[];
  kilitler text[] := '{}';
  t text;
  etiket text;
  ref record;
  gercek text;
  nullanan jsonb := '{}';
  bag record;
  trg record;
  n bigint;
BEGIN
  SELECT k.tablo, k.anahtar INTO kok, anahtar FROM ayarlar_temizlik_koku(p_tur) k;
  IF kok IS NULL THEN RAISE EXCEPTION 'Bilinmeyen tür: %', p_tur USING ERRCODE = 'invalid_parameter_value'; END IF;
  EXECUTE format('SELECT ctid::text FROM %s WHERE %I = $1', kok, anahtar) INTO kok_ctid USING p_kimlik;
  IF kok_ctid IS NULL THEN
    RETURN jsonb_build_object('satirlar', '{}'::jsonb, 'kilitler', jsonb_build_array('Kayıt yok'), 'no', NULL);
  END IF;
  kok_no := CASE p_tur
    WHEN 'uretim_emri' THEN (SELECT emir_no FROM uretim_emri WHERE id = p_kimlik)
    WHEN 'siparis' THEN (SELECT no FROM siparisler_siparis WHERE id = p_kimlik)
    ELSE (SELECT coalesce(stok_kodu, kimlik) FROM malzeme_katalog_karti WHERE no = p_kimlik)
  END;
  -- Etkin kart Logo kuyruğuna kendiliğinden girer ('bekliyor'); kilit yalnız Logo'da karşılığı olan karttadır.
  IF p_tur = 'malzeme' AND EXISTS (SELECT FROM malzeme_katalog_karti WHERE no = p_kimlik
      AND (logo_kayit_no IS NOT NULL OR logo_gonderim_durumu = 'gonderildi')) THEN
    kilitler := kilitler || 'Logo''ya gönderildi'::text;
  END IF;

  ziyaret := jsonb_build_object(kok::text, jsonb_build_array(kok_ctid));
  kuyruk := jsonb_build_array(jsonb_build_object('t', kok::text, 'c', jsonb_build_array(kok_ctid)));
  WHILE jsonb_array_length(kuyruk) > 0 LOOP
    oge := kuyruk -> 0;
    kuyruk := kuyruk - 0;
    baba := oge ->> 't';
    FOR fk IN
      SELECT c.conrelid::regclass AS cocuk, c.conkey, c.confkey, c.confdeltype FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid = baba::regclass
      ORDER BY c.conname
    LOOP
      SELECT string_agg(format('ch.%I = p.%I', ca.attname, pa.attname), ' AND ') INTO kosul
      FROM unnest(fk.conkey, fk.confkey) AS u(ck, pk)
      JOIN pg_attribute ca ON ca.attrelid = fk.cocuk AND ca.attnum = u.ck
      JOIN pg_attribute pa ON pa.attrelid = baba::regclass AND pa.attnum = u.pk;
      EXECUTE format('SELECT coalesce(array_agg(DISTINCT ch.ctid::text), ''{}'') FROM %s ch JOIN %s p ON %s WHERE p.ctid = ANY($1::tid[])',
        fk.cocuk, baba, kosul)
        INTO yeni USING ARRAY(SELECT jsonb_array_elements_text(oge -> 'c'));
      IF fk.confdeltype IN ('n', 'd') THEN
        -- Bu çocuk yaşar, bağlantısı boşalır; kümeye girmeyen böyle satır varsa kök kilitlidir (3395 Risk K2).
        IF cardinality(yeni) > 0 THEN
          nullanan := jsonb_set(nullanan, ARRAY[fk.cocuk::text], to_jsonb(ARRAY(
            SELECT DISTINCT x FROM (SELECT jsonb_array_elements_text(coalesce(nullanan -> fk.cocuk::text, '[]')) UNION SELECT unnest(yeni)) u(x))));
        END IF;
        CONTINUE;
      END IF;
      onceki := ARRAY(SELECT jsonb_array_elements_text(coalesce(ziyaret -> fk.cocuk::text, '[]')));
      yeni := ARRAY(SELECT unnest(yeni) EXCEPT SELECT unnest(onceki));
      IF cardinality(yeni) > 0 THEN
        ziyaret := jsonb_set(ziyaret, ARRAY[fk.cocuk::text], to_jsonb(onceki || yeni));
        kuyruk := kuyruk || jsonb_build_array(jsonb_build_object('t', fk.cocuk::text, 'c', to_jsonb(yeni)));
      END IF;
    END LOOP;
    -- Yabancı anahtarı henüz olmayan emir bağları (uretim_emri_id sütunu; Aşama 2 göçü bekleyen malzeme fişi, refakat, plan izi):
    -- emrin kaydıdır, emirle gider (3395 Risk K1).
    IF baba = 'uretim_emri' THEN
      FOR fk IN SELECT * FROM ayarlar_temizlik_fk_siz_cocuklar('uretim_emri_id') LOOP
        EXECUTE format('SELECT coalesce(array_agg(DISTINCT ch.ctid::text), ''{}'') FROM %s ch JOIN uretim_emri p ON ch.uretim_emri_id = p.id WHERE p.ctid = ANY($1::tid[])', fk.cocuk)
          INTO yeni USING ARRAY(SELECT jsonb_array_elements_text(oge -> 'c'));
        onceki := ARRAY(SELECT jsonb_array_elements_text(coalesce(ziyaret -> fk.cocuk::text, '[]')));
        yeni := ARRAY(SELECT unnest(yeni) EXCEPT SELECT unnest(onceki));
        IF cardinality(yeni) > 0 THEN
          ziyaret := jsonb_set(ziyaret, ARRAY[fk.cocuk::text], to_jsonb(onceki || yeni));
          kuyruk := kuyruk || jsonb_build_array(jsonb_build_object('t', fk.cocuk::text, 'c', to_jsonb(yeni)));
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Malzemeye yabancı anahtarsız bağlı (malzeme_no) kayıt varsa kök kilitlidir: sütunun hangi kartı gösterdiği kesin değil, silinmez.
  IF p_tur = 'malzeme' THEN
    FOR fk IN SELECT * FROM ayarlar_temizlik_fk_siz_cocuklar('malzeme_no') LOOP
      EXECUTE format('SELECT EXISTS (SELECT FROM %s WHERE malzeme_no = $1)', fk.cocuk) INTO gercek USING p_kimlik;
      IF gercek::boolean THEN kilitler := kilitler || format('Yabancı anahtarsız bağlı kayıt var (%s)', fk.cocuk); END IF;
    END LOOP;
  END IF;

  FOR t IN SELECT jsonb_object_keys(nullanan) LOOP
    IF EXISTS (SELECT jsonb_array_elements_text(nullanan -> t) EXCEPT SELECT jsonb_array_elements_text(coalesce(ziyaret -> t, '[]'))) THEN
      kilitler := kilitler || format('Bağlantısı silinecek kayıt var (%s)', t);
    END IF;
  END LOOP;

  FOR bag IN SELECT * FROM ayarlar_temizlik_fk_siz_baglar() b WHERE ziyaret ? b.hedef AND to_regclass(b.kaynak) IS NOT NULL LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT FROM %1$s h JOIN %2$I g ON g.belge_no = h.%3$I WHERE h.ctid = ANY($1::tid[]) AND ($2::text[] IS NULL OR g.belge_turu = ANY($2))
         AND (g.logo_kayit_no IS NOT NULL OR g.niyet_zamani IS NOT NULL OR g.son_sonuc IN (''gonderildi'', ''zaten-vardi'', ''belirsiz'')))',
      bag.hedef::regclass, bag.kaynak, bag.sutun)
      INTO gercek USING ARRAY(SELECT jsonb_array_elements_text(ziyaret -> bag.hedef)), bag.turler;
    IF gercek::boolean THEN kilitler := kilitler || 'Logo''ya gönderildi'::text; END IF;
  END LOOP;

  FOR t IN SELECT jsonb_object_keys(ziyaret) LOOP
    FOR trg IN SELECT p.proname FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid
        WHERE g.tgrelid = t::regclass AND NOT g.tgisinternal AND g.tgenabled = 'O'
          AND (g.tgtype & 1) <> 0 AND (g.tgtype & 2) <> 0 AND (g.tgtype & 8) <> 0 AND NOT ayarlar_temizlik_kapanir_tetik(p.proname) LOOP
      kilitler := kilitler || format('Silme kuralı var (%s)', trg.proname);
    END LOOP;
  END LOOP;

  -- Stok (3395 Risk K3): kümedeki hareketlerin bakiyeye etkisi geri alınabilmeli. Deneme hareketi gerçek stoktan düştüyse ya da
  -- eklediği stok sonradan kullanıldıysa (kümedışı bakiye yetmez) kök kilitlidir.
  IF ziyaret ? 'stok_hareketi' THEN
    SELECT count(*) INTO n FROM ayarlar_temizlik_stok_etkisi(ARRAY(SELECT jsonb_array_elements_text(ziyaret -> 'stok_hareketi'))::tid[],
      ARRAY(SELECT jsonb_array_elements_text(coalesce(ziyaret -> 'stok_bakiye', '[]')))::tid[]) e WHERE NOT e.karsilanir;
    IF n > 0 THEN kilitler := kilitler || 'Stok bakiyesi geri alınamaz (gerçek stoktan düşmüş ya da sonradan kullanılmış)'::text; END IF;
  END IF;

  FOR t IN SELECT jsonb_object_keys(ziyaret) LOOP
    etiket := ayarlar_temizlik_kilit_etiketi(t);
    IF etiket IS NOT NULL THEN kilitler := kilitler || etiket; END IF;
    -- Kümedeki bir satır işaretsiz bir kök kayda bağlıysa ya da kendisi işaretsiz kökse, gerçek kayıt kullanıyordur.
    FOR ref IN
      SELECT k.tur, k.tablo, k.anahtar, c.conkey, c.confkey FROM pg_constraint c
      JOIN LATERAL (SELECT v.tur, (ayarlar_temizlik_koku(v.tur)).* FROM (VALUES ('uretim_emri'), ('siparis'), ('malzeme')) v(tur)) k
        ON k.tablo = c.confrelid
      WHERE c.contype = 'f' AND c.conrelid = t::regclass AND cardinality(c.conkey) = 1
        AND (SELECT attname FROM pg_attribute WHERE attrelid = c.confrelid AND attnum = c.confkey[1]) = k.anahtar
    LOOP
      EXECUTE format(
        'SELECT min(x.%1$I::text) FROM %2$s x WHERE x.ctid = ANY($1::tid[]) AND x.%1$I IS NOT NULL
           AND NOT EXISTS (SELECT FROM ayarlar_deneme_isareti i WHERE i.tur = $2 AND i.kimlik = x.%1$I::bigint)',
        (SELECT attname FROM pg_attribute WHERE attrelid = t::regclass AND attnum = ref.conkey[1]), t)
        INTO gercek USING ARRAY(SELECT jsonb_array_elements_text(ziyaret -> t)), ref.tur;
      IF gercek IS NOT NULL THEN
        kilitler := kilitler || format('İşaretsiz %s kaydına bağlı (%s)', CASE ref.tur WHEN 'uretim_emri' THEN 'üretim emri'
          WHEN 'siparis' THEN 'sipariş' ELSE 'malzeme' END, t);
      END IF;
    END LOOP;
    FOR ref IN SELECT v.tur, (ayarlar_temizlik_koku(v.tur)).* FROM (VALUES ('uretim_emri'), ('siparis'), ('malzeme')) v(tur) LOOP
      IF ref.tablo::text = t THEN
        EXECUTE format(
          'SELECT min(x.%1$I::text) FROM %2$s x WHERE x.ctid = ANY($1::tid[])
             AND NOT EXISTS (SELECT FROM ayarlar_deneme_isareti i WHERE i.tur = $2 AND i.kimlik = x.%1$I::bigint)', ref.anahtar, t)
          INTO gercek USING ARRAY(SELECT x FROM jsonb_array_elements_text(ziyaret -> t) x WHERE x <> kok_ctid OR t <> kok::text), ref.tur;
        IF gercek IS NOT NULL THEN
          kilitler := kilitler || format('İşaretsiz %s bağlı', CASE ref.tur WHEN 'uretim_emri' THEN 'üretim emri'
            WHEN 'siparis' THEN 'sipariş' ELSE 'malzeme' END);
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('satirlar', ziyaret, 'no', kok_no,
    'kilitler', to_jsonb(ARRAY(SELECT DISTINCT unnest(kilitler) ORDER BY 1)));
END $$;

-- Seçimin etkisi: kök başına numara, kilit ve tablo sayıları; birleşik kümenin tablo sayıları ve özeti. Ekran bunu gösterir,
-- temizlik aynı özeti ister.
CREATE FUNCTION ayarlar_temizlik_etkisi(p_secim jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  s jsonb;
  k jsonb;
  kokler jsonb := '[]';
  birlesik jsonb := '{}';
  t text;
  isaretli boolean;
BEGIN
  FOR s IN SELECT jsonb_array_elements(p_secim) LOOP
    k := ayarlar_temizlik_kapsami(s ->> 'tur', (s ->> 'kimlik')::bigint);
    isaretli := EXISTS (SELECT FROM ayarlar_deneme_isareti WHERE tur = s ->> 'tur' AND kimlik = (s ->> 'kimlik')::bigint);
    IF NOT isaretli THEN k := jsonb_set(k, '{kilitler}', (k -> 'kilitler') || '"Deneme işareti yok"'); END IF;
    kokler := kokler || jsonb_build_array(jsonb_build_object(
      'tur', s ->> 'tur', 'kimlik', (s ->> 'kimlik')::bigint, 'no', k -> 'no', 'kilitler', k -> 'kilitler',
      'tablolar', coalesce((SELECT jsonb_object_agg(key, jsonb_array_length(value)) FROM jsonb_each(k -> 'satirlar')), '{}')));
    IF jsonb_array_length(k -> 'kilitler') = 0 THEN
      FOR t IN SELECT jsonb_object_keys(k -> 'satirlar') LOOP
        birlesik := jsonb_set(birlesik, ARRAY[t], to_jsonb(ARRAY(
          SELECT DISTINCT x FROM (SELECT jsonb_array_elements_text(coalesce(birlesik -> t, '[]')) UNION SELECT jsonb_array_elements_text(k -> 'satirlar' -> t)) AS u(x)
          ORDER BY x)));
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'kokler', kokler,
    'tablolar', coalesce((SELECT jsonb_object_agg(key, jsonb_array_length(value)) FROM jsonb_each(birlesik)), '{}'),
    'ozet', md5(birlesik::text),
    'satirlar', birlesik);
END $$;

-- Temizlik: yalnız kilitsiz ve işaretli kökler; özet etkideki özetle aynı olmalı. Silmeyi engelleyen satır tetikleri (BEFORE DELETE)
-- yalnız kümedeki tablolarda, yalnız bu transaction içinde kapanır ve dönmeden açılır; hata olursa transaction ile geri alınır.
-- Denetim tabloları kümeye girerse kök kilitli olduğundan bu noktaya hiç gelinmez. Silinmeyen satır kalırsa her şey geri alınır.
CREATE FUNCTION ayarlar_veri_temizle(p_secim jsonb, p_ozet text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
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
  IF jsonb_typeof(p_secim) <> 'array' OR jsonb_array_length(p_secim) = 0 THEN
    RAISE EXCEPTION 'Seçim boş' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Kökler etkiden önce kilitlenir: arada başka işlem köke yeni bağlı satır ekleyemez (kümede olmayan çocuk sessizce gitmesin).
  FOR sec IN SELECT jsonb_array_elements(p_secim) LOOP
    SELECT k.tablo, k.anahtar INTO kok, anahtar FROM ayarlar_temizlik_koku(sec ->> 'tur') k;
    IF kok IS NOT NULL THEN EXECUTE format('SELECT 1 FROM %s WHERE %I = $1 FOR UPDATE', kok, anahtar) USING (sec ->> 'kimlik')::bigint; END IF;
  END LOOP;
  etki := ayarlar_temizlik_etkisi(p_secim);
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
      IF NOT ayarlar_temizlik_kapanir_tetik(trg.proname) THEN
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
  DELETE FROM ayarlar_deneme_isareti i USING jsonb_array_elements(p_secim) s
  WHERE i.tur = s ->> 'tur' AND i.kimlik = (s ->> 'kimlik')::bigint;

  RETURN jsonb_build_object('tablolar', sayilar,
    'kokler', (SELECT jsonb_agg(jsonb_build_object('tur', x ->> 'tur', 'no', x -> 'no')) FROM jsonb_array_elements(etki -> 'kokler') x));
END $$;

-- Temizlik ekranının aday listesi: açılış günü aralığı, açan kişi ve işaret süzgeci; yeniden eskiye, en çok p_sinir satır.
-- toplam süzgece uyan bütün satırların sayısıdır. Kök tabloları başka modüllerindir: okuma da temizlikle aynı işlev ailesinde
-- durur (3395 a madde 6), ayarlar modülünün sorgusu yalnız bu işlevi çağırır.
CREATE FUNCTION ayarlar_temizlik_adaylari(p_tur text, p_baslangic date, p_bitis date, p_kisi int, p_yalniz_isaretli boolean, p_sinir int)
RETURNS TABLE (kimlik bigint, no text, ad text, acan text, acilis timestamptz, durum text, isaretli boolean, toplam bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT SET timezone = 'Europe/Istanbul' AS $$
  SELECT x.*, count(*) OVER () FROM (
    SELECT e.id::bigint, e.emir_no, e.parca_ad, k.ad, e.acilma, e.durum, i.kimlik IS NOT NULL
    FROM uretim_emri e JOIN kisi k ON k.id = e.acan_id
    LEFT JOIN ayarlar_deneme_isareti i ON i.tur = 'uretim_emri' AND i.kimlik = e.id
    WHERE p_tur = 'uretim_emri' AND (p_kisi IS NULL OR e.acan_id = p_kisi)
      AND (p_baslangic IS NULL OR e.acilma >= p_baslangic) AND (p_bitis IS NULL OR e.acilma < p_bitis + 1)
    UNION ALL
    SELECT s.id::bigint, s.no, f.ad, k.ad, s.olusturma, s.durum, i.kimlik IS NOT NULL
    FROM siparisler_siparis s JOIN kisi k ON k.id = s.olusturan_id JOIN musteri_tedarikci_firma f ON f.id = s.firma_id
    LEFT JOIN ayarlar_deneme_isareti i ON i.tur = 'siparis' AND i.kimlik = s.id
    WHERE p_tur = 'siparis' AND (p_kisi IS NULL OR s.olusturan_id = p_kisi)
      AND (p_baslangic IS NULL OR s.olusturma >= p_baslangic) AND (p_bitis IS NULL OR s.olusturma < p_bitis + 1)
    UNION ALL
    SELECT m.no::bigint, coalesce(m.stok_kodu, m.kimlik), m.kayit -> 'com' ->> 'ad', k.ad, m.acilma, m.onay_durumu, i.kimlik IS NOT NULL
    FROM malzeme_katalog_karti m JOIN kisi k ON k.id = m.acan_kisi_id
    LEFT JOIN ayarlar_deneme_isareti i ON i.tur = 'malzeme' AND i.kimlik = m.no
    WHERE p_tur = 'malzeme' AND (p_kisi IS NULL OR m.acan_kisi_id = p_kisi)
      AND (p_baslangic IS NULL OR m.acilma >= p_baslangic) AND (p_bitis IS NULL OR m.acilma < p_bitis + 1)
  ) AS x(kimlik, no, ad, acan, acilis, durum, isaretli)
  WHERE NOT p_yalniz_isaretli OR x.isaretli
  ORDER BY x.acilis DESC, x.kimlik DESC
  LIMIT p_sinir
$$;
