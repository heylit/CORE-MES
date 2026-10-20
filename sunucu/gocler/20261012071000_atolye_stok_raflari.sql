-- Raf ve göz Fabrika Haritası'nda tek kaynaktır (kart #686, kullanıcı kararı 12.10.2026 "Tam birleştir", adım 1): stokun
-- depoları bölüm, rafları raf, raf gözü konumları göz, öteki konumları zemin alanı olarak atölyeye kopyalanır. Stok
-- tabloları değişmez. Kaynak kimlikleri (stok_*_id) stok göçünün bağı kurması içindir ve adım 2'de kalkar; stok tabloları
-- da adım 2'de kalktığından yabancı anahtar değildir.

ALTER TABLE atolye_raf DROP CONSTRAINT atolye_raf_sayilari,
  ADD CONSTRAINT atolye_raf_sayilari CHECK (bolme_sayisi BETWEEN 1 AND 99 AND kat_sayisi BETWEEN 1 AND 10 AND goz_sayisi BETWEEN 1 AND 9);
ALTER TABLE atolye_goz DROP CONSTRAINT atolye_goz_sayilari,
  ADD CONSTRAINT atolye_goz_sayilari CHECK (bolme BETWEEN 1 AND 99 AND kat BETWEEN 1 AND 10 AND goz BETWEEN 1 AND 9);
ALTER TABLE atolye_alan DROP CONSTRAINT atolye_alan_tur_degeri,
  ADD CONSTRAINT atolye_alan_tur_degeri CHECK (tur IN ('yuruyus_yolu', 'bolge', 'karantina', 'sevkiyat', 'oda', 'cam_oda', 'palet',
                                                      'kabul', 'uretim_cikisi', 'depo_zemini', 'fason'));

ALTER TABLE atolye_salon ADD COLUMN stok_depo_id int, ADD CONSTRAINT atolye_salon_stok_depo_tek UNIQUE (stok_depo_id);
ALTER TABLE atolye_raf ADD COLUMN stok_raf_id int, ADD CONSTRAINT atolye_raf_stok_raf_tek UNIQUE (stok_raf_id);
ALTER TABLE atolye_goz ADD COLUMN stok_konum_id int, ADD CONSTRAINT atolye_goz_stok_konum_tek UNIQUE (stok_konum_id);
ALTER TABLE atolye_alan ADD COLUMN stok_konum_id int, ADD CONSTRAINT atolye_alan_stok_konum_tek UNIQUE (stok_konum_id);

-- Eksenler: stok rafının (x, z) noktası ilk bölmenin kenar ortasıdır, bölmeler yerel -z yönünde dizilir, açı saat yönünün
-- tersinedir, ön yüz yerel +x (ters rafta -x). Atölye rafının (x, z) noktası merkezdir, bölmeler yerel +x yönünde,
-- ön yüz +z. Dönüş ön yüzü korur; ön yüzü ters stok rafında bölme sırası tersten sayılır (göz aynı yerde kalır).
DO $$
DECLARE
  kaydeden int;
  d record;
  y record;
  r record;
  k record;
  minx numeric; minz numeric; maxx numeric; maxz numeric;
  ox numeric; oz numeric;
  bw numeric; dep numeric; boy numeric; yuk numeric;
  c int; s int;
  serit int;
  sira int;
  salon int;
  salon_kodu text;
  sonraki_x numeric;
  raf int;
  kod text;
  taban text;
  n int;
  kabul_kullanildi boolean;
  fason_kullanildi boolean;
  atlanan int := 0;
  kirpilan int := 0;
  depo_sayisi int := 0;
  raf_sayisi int := 0;
  alan_sayisi int := 0;
BEGIN
  -- Kaydeden: ilk yönetici, yoksa ilk kişi.
  SELECT k2.id INTO kaydeden FROM kisi k2
   ORDER BY EXISTS (SELECT 1 FROM kisi_rolu kr JOIN rol ON rol.id = kr.rol_id WHERE kr.kisi_id = k2.id AND rol.yonetici) DESC, k2.id
   LIMIT 1;
  IF kaydeden IS NULL THEN
    RAISE NOTICE 'atolye_stok_raflari: kişi yok (yeni kurulum); kopya atlandı.';
    RETURN;
  END IF;

  SELECT COALESCE(max(fabrika_x + greatest(genislik, derinlik)) + 5, 0) INTO sonraki_x FROM atolye_salon;

  FOR d IN
    SELECT * FROM stok_depo sd
     WHERE sd.aktif OR EXISTS (SELECT 1 FROM stok_konum WHERE depo_id = sd.id) OR EXISTS (SELECT 1 FROM stok_raf WHERE depo_id = sd.id)
     ORDER BY sd.kod
  LOOP
    SELECT * INTO y FROM stok_depo_yerlesimi WHERE depo_id = d.id;

    -- Bölüm kutusu: bina, raflar, kabul alanı ve fason dolabının hepsini içerir; konumu olmayan alanlar üstte bir şeride dizilir.
    minx := NULL; minz := NULL; maxx := NULL; maxz := NULL;
    IF y.depo_id IS NOT NULL THEN
      minx := least(y.bina_x0, y.kabul_x - y.kabul_genislik / 2, y.fason_x - 1);
      maxx := greatest(y.bina_x1, y.kabul_x + y.kabul_genislik / 2, y.fason_x + 1);
      minz := least(y.bina_z0, y.kabul_z - y.kabul_derinlik / 2, y.fason_z - 1);
      maxz := greatest(y.bina_z1, y.kabul_z + y.kabul_derinlik / 2, y.fason_z + 1);
    END IF;
    FOR r IN SELECT * FROM stok_raf WHERE depo_id = d.id LOOP
      c := round(cos(radians(r.aci)))::int;
      s := round(sin(radians(r.aci)))::int;
      bw := least(greatest(r.bolme_genislik_m, 0.2), 10, floor(10000 / r.bolme_sayisi) / 100);
      boy := r.bolme_sayisi * bw;
      dep := least(greatest(r.derinlik_m, 0.2), 10);
      FOR k IN SELECT lx, lz FROM (VALUES (-dep / 2, 0::numeric), (dep / 2, 0), (dep / 2, -boy), (-dep / 2, -boy)) AS t (lx, lz) LOOP
        minx := least(minx, r.x_m + k.lx * c + k.lz * s);
        maxx := greatest(maxx, r.x_m + k.lx * c + k.lz * s);
        minz := least(minz, r.z_m - k.lx * s + k.lz * c);
        maxz := greatest(maxz, r.z_m - k.lx * s + k.lz * c);
      END LOOP;
    END LOOP;
    IF minx IS NULL THEN
      minx := 0; minz := 0; maxx := 10; maxz := 10;
    END IF;

    SELECT count(*) INTO serit FROM (
      SELECT tur, row_number() OVER (PARTITION BY tur ORDER BY id) AS sira FROM stok_konum WHERE depo_id = d.id AND tur <> 'raf_gozu'
    ) t WHERE y.depo_id IS NULL OR t.tur NOT IN ('kabul', 'fason') OR t.sira > 1;
    IF serit > 0 THEN
      minz := minz - 4;
      maxx := greatest(maxx, minx + 1 + serit * 4);
    END IF;

    ox := floor(minx) - 1;
    oz := floor(minz) - 1;
    maxx := greatest(ceil(maxx) + 1, ox + 5);
    maxz := greatest(ceil(maxz) + 1, oz + 5);
    IF maxx - ox > 500 OR maxz - oz > 500 THEN
      RAISE EXCEPTION 'Depo % bölüme sığmıyor: % x % m (en çok 500 x 500)', d.kod, maxx - ox, maxz - oz;
    END IF;

    salon_kodu := d.kod;
    IF EXISTS (SELECT 1 FROM atolye_salon WHERE atolye_salon.kod = salon_kodu) THEN salon_kodu := d.kod || '-DEPO'; END IF;
    IF EXISTS (SELECT 1 FROM atolye_salon WHERE atolye_salon.kod = salon_kodu) THEN
      RAISE EXCEPTION 'Depo % için bölüm kodu bulunamadı (% ve %-DEPO kullanılıyor)', d.kod, d.kod, d.kod;
    END IF;

    INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, giris_x, giris_z, kaydeden_kisi_id, fabrika_x, fabrika_z, stok_depo_id)
    VALUES (salon_kodu, d.ad, maxx - ox, maxz - oz, COALESCE(y.kare_boyu, 5),
            CASE WHEN y.depo_id IS NULL THEN NULL ELSE round(y.kabul_x - ox, 2) END,
            CASE WHEN y.depo_id IS NULL THEN NULL ELSE round(y.kabul_z - oz, 2) END,
            kaydeden, sonraki_x, 0, d.id)
    RETURNING id INTO salon;
    sonraki_x := sonraki_x + greatest(maxx - ox, maxz - oz) + 5;
    depo_sayisi := depo_sayisi + 1;

    FOR r IN SELECT * FROM stok_raf WHERE depo_id = d.id ORDER BY kod, id LOOP
      c := round(cos(radians(r.aci)))::int;
      s := round(sin(radians(r.aci)))::int;
      bw := least(greatest(r.bolme_genislik_m, 0.2), 10, floor(10000 / r.bolme_sayisi) / 100);
      boy := r.bolme_sayisi * bw;
      dep := least(greatest(r.derinlik_m, 0.2), 10);
      yuk := least(greatest(r.kat_sayisi * r.kat_araligi_m, 0.1), 15);
      IF bw <> r.bolme_genislik_m OR dep <> r.derinlik_m OR yuk <> r.kat_sayisi * r.kat_araligi_m THEN kirpilan := kirpilan + 1; END IF;

      -- Kod: depo kodunun başı + stok raf kodu (ANA, 12 -> A12); çakışırsa baş bir harf uzar. Rakamla başlayan depoda baş D.
      taban := CASE WHEN d.kod ~ '^[A-Z]' THEN d.kod ELSE 'D' || d.kod END;
      kod := NULL;
      FOR n IN 1 .. least(length(taban), 5 - length(r.kod)) LOOP
        IF NOT EXISTS (SELECT 1 FROM atolye_raf WHERE atolye_raf.kod = left(taban, n) || r.kod) THEN
          kod := left(taban, n) || r.kod;
          EXIT;
        END IF;
      END LOOP;
      IF kod IS NULL THEN
        RAISE EXCEPTION 'Depo % rafı % için boş raf kodu bulunamadı', d.kod, r.kod;
      END IF;

      INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik,
                              x, z, donus, aktif, stok_raf_id)
      VALUES (salon, kod, left(d.ad || ' / ' || r.kod, 120), CASE r.tur WHEN 'celik' THEN 'kucuk_parca' ELSE r.tur END,
              r.bolme_sayisi, r.kat_sayisi, 1, bw, dep, yuk,
              round(r.x_m - boy / 2 * s - ox, 2), round(r.z_m - boy / 2 * c - oz, 2),
              CASE WHEN r.on_yuz_ters THEN (450 - r.aci) % 360 ELSE (630 - r.aci) % 360 END,
              r.aktif, r.id)
      RETURNING id INTO raf;
      raf_sayisi := raf_sayisi + 1;

      INSERT INTO atolye_goz (raf_id, bolme, kat, goz)
      SELECT raf, b, kt, 1 FROM generate_series(1, r.bolme_sayisi) b, generate_series(1, r.kat_sayisi) kt;

      -- Stok bölme numarası (sıralı, tek, çift) sıraya çevrilir; rafın ölçüsüne uymayan (daralmış rafın pasif) göz bağlanmaz.
      UPDATE atolye_goz g SET stok_konum_id = t.id
        FROM (
          SELECT sk.id, sk.kat_no,
                 CASE r.numaralama WHEN 'tek' THEN (sk.bolme_no - 1) / 2 WHEN 'cift' THEN (sk.bolme_no - 2) / 2 ELSE sk.bolme_no - r.ilk_bolme END AS sira,
                 CASE r.numaralama WHEN 'tek' THEN sk.bolme_no % 2 = 1 WHEN 'cift' THEN sk.bolme_no % 2 = 0 ELSE true END AS uygun
            FROM stok_konum sk WHERE sk.raf_id = r.id AND sk.tur = 'raf_gozu'
        ) t
       WHERE t.uygun AND t.sira BETWEEN 0 AND r.bolme_sayisi - 1 AND t.kat_no <= r.kat_sayisi
         AND g.raf_id = raf AND g.kat = t.kat_no AND g.goz = 1
         AND g.bolme = CASE WHEN r.on_yuz_ters THEN r.bolme_sayisi - t.sira ELSE t.sira + 1 END;
      SELECT atlanan + count(*) INTO atlanan FROM stok_konum sk
       WHERE sk.raf_id = r.id AND sk.tur = 'raf_gozu' AND NOT EXISTS (SELECT 1 FROM atolye_goz WHERE stok_konum_id = sk.id);
    END LOOP;

    sira := 0;
    kabul_kullanildi := false;
    fason_kullanildi := false;
    FOR k IN SELECT * FROM stok_konum WHERE depo_id = d.id AND tur <> 'raf_gozu' ORDER BY id LOOP
      IF k.tur = 'kabul' AND y.depo_id IS NOT NULL AND NOT kabul_kullanildi THEN
        kabul_kullanildi := true;
        INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik, stok_konum_id)
        VALUES (salon, k.tur, left(COALESCE(k.ad, k.kod), 120), round(y.kabul_x - ox, 2), round(y.kabul_z - oz, 2), 0,
                y.kabul_genislik, y.kabul_derinlik, k.id);
      ELSIF k.tur = 'fason' AND y.depo_id IS NOT NULL AND NOT fason_kullanildi THEN
        fason_kullanildi := true;
        INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik, stok_konum_id)
        VALUES (salon, k.tur, left(COALESCE(k.ad, k.kod), 120), round(y.fason_x - ox, 2), round(y.fason_z - oz, 2),
                (360 - y.fason_aci) % 360, 2, 1, k.id);
      ELSE
        INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik, stok_konum_id)
        VALUES (salon, k.tur, left(COALESCE(k.ad, k.kod), 120), round(minx - ox + 2.5 + sira * 4, 2), round(minz - oz + 2, 2), 0, 3, 3, k.id);
        sira := sira + 1;
      END IF;
      alan_sayisi := alan_sayisi + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'atolye_stok_raflari: % depo bölüm, % raf, % alan kopyalandı; % raf gözü bağlanamadı, % rafın ölçüsü sınıra çekildi.',
    depo_sayisi, raf_sayisi, alan_sayisi, atlanan, kirpilan;
END $$;
