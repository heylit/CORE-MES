-- Atölye yerleşimi: salon, istasyon yerleri, raflar ve gözleri, zemin alanları, duvarlar. Tek güncel yerleşim tutulur;
-- eşzamanlı kaydı salonun sürüm numarası ayırır, değişiklik geçmişi denetim kaydındadır.
-- Koordinat salonun sol üst köşesinden metredir (x genişlik, z derinlik yönü); dönüş derecedir.

CREATE TABLE atolye_salon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL,
  ad text NOT NULL,
  genislik numeric(6, 2) NOT NULL,
  derinlik numeric(6, 2) NOT NULL,
  hucre_boyu numeric(5, 2) NOT NULL,
  -- Depo girişi: rotanın varsayılan başlangıcı. İkisi birlikte dolu ya da birlikte boş.
  giris_x numeric(6, 2),
  giris_z numeric(6, 2),
  surum int NOT NULL DEFAULT 1,
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atolye_salon_kod_tek UNIQUE (kod),
  CONSTRAINT atolye_salon_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  CONSTRAINT atolye_salon_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_salon_olcusu CHECK (genislik BETWEEN 5 AND 500 AND derinlik BETWEEN 5 AND 500),
  CONSTRAINT atolye_salon_hucre_boyu CHECK (hucre_boyu BETWEEN 1 AND 50),
  CONSTRAINT atolye_salon_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT atolye_salon_giris_butun CHECK ((giris_x IS NULL) = (giris_z IS NULL)),
  CONSTRAINT atolye_salon_giris_salonda CHECK (giris_x IS NULL OR (giris_x BETWEEN 0 AND genislik AND giris_z BETWEEN 0 AND derinlik))
);
CREATE INDEX atolye_salon_kaydeden_idx ON atolye_salon (kaydeden_kisi_id);

-- Bir istasyonun en çok bir yeri vardır; istasyonun kendisi istasyonlar modülündedir.
CREATE TABLE atolye_istasyon_yeri (
  istasyon_id int PRIMARY KEY REFERENCES istasyon,
  salon_id int NOT NULL REFERENCES atolye_salon,
  x numeric(6, 2) NOT NULL,
  z numeric(6, 2) NOT NULL,
  donus numeric(4, 1) NOT NULL,
  genislik numeric(5, 2) NOT NULL,
  derinlik numeric(5, 2) NOT NULL,
  CONSTRAINT atolye_istasyon_yeri_donus CHECK (donus >= 0 AND donus < 360),
  CONSTRAINT atolye_istasyon_yeri_ayak_izi CHECK (genislik BETWEEN 0.2 AND 50 AND derinlik BETWEEN 0.2 AND 50)
);
CREATE INDEX atolye_istasyon_yeri_salon_idx ON atolye_istasyon_yeri (salon_id);

-- Göz adresi Raf-Bölme-Kat-Göz (R1-02-3-1); raf kodunda tire yoktur, adresin ayracıyla karışmaz.
-- Raf silinmez, pasife alınır: göze ileride stok bağlanır.
CREATE TABLE atolye_raf (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id int NOT NULL REFERENCES atolye_salon,
  kod text NOT NULL,
  ad text NOT NULL,
  tur text NOT NULL,
  bolme_sayisi smallint NOT NULL,
  kat_sayisi smallint NOT NULL,
  goz_sayisi smallint NOT NULL,
  bolme_genisligi numeric(4, 2) NOT NULL,
  derinlik numeric(4, 2) NOT NULL,
  yukseklik numeric(4, 2) NOT NULL,
  x numeric(6, 2) NOT NULL,
  z numeric(6, 2) NOT NULL,
  donus numeric(4, 1) NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  -- Ertelenmiş: aynı kayıtta iki rafın kodu yer değiştirebilir (R1 <-> R2).
  CONSTRAINT atolye_raf_kod_tek UNIQUE (kod) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT atolye_raf_kod_bicimi CHECK (kod ~ '^[A-Z][A-Z0-9]{0,4}$'),
  CONSTRAINT atolye_raf_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_raf_tur_degeri CHECK (tur IN ('palet', 'kucuk_parca', 'konsol', 'zemin')),
  CONSTRAINT atolye_raf_sayilari CHECK (bolme_sayisi BETWEEN 1 AND 99 AND kat_sayisi BETWEEN 1 AND 9 AND goz_sayisi BETWEEN 1 AND 9),
  CONSTRAINT atolye_raf_olculeri CHECK (bolme_genisligi BETWEEN 0.2 AND 10 AND derinlik BETWEEN 0.2 AND 10 AND yukseklik BETWEEN 0.1 AND 15),
  CONSTRAINT atolye_raf_boyu CHECK (bolme_sayisi * bolme_genisligi <= 100),
  CONSTRAINT atolye_raf_donus CHECK (donus >= 0 AND donus < 360)
);
CREATE INDEX atolye_raf_salon_idx ON atolye_raf (salon_id);

-- Göz satırı sayı kimliğiyle bağlanmak içindir; adres metni saklanmaz, raf kodundan üretilir (kod değişebilir).
CREATE TABLE atolye_goz (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raf_id int NOT NULL REFERENCES atolye_raf,
  bolme smallint NOT NULL,
  kat smallint NOT NULL,
  goz smallint NOT NULL,
  CONSTRAINT atolye_goz_tek UNIQUE (raf_id, bolme, kat, goz),
  CONSTRAINT atolye_goz_sayilari CHECK (bolme BETWEEN 1 AND 99 AND kat BETWEEN 1 AND 9 AND goz BETWEEN 1 AND 9)
);

-- Zemin alanı: yürüyüş yolu, bölge, karantina, sevkiyat, oda, cam oda, palet yeri. Kapı yalnız odadadır.
CREATE TABLE atolye_alan (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id int NOT NULL REFERENCES atolye_salon,
  tur text NOT NULL,
  ad text NOT NULL,
  x numeric(6, 2) NOT NULL,
  z numeric(6, 2) NOT NULL,
  donus numeric(4, 1) NOT NULL,
  genislik numeric(5, 2) NOT NULL,
  derinlik numeric(5, 2) NOT NULL,
  kapi_kenari text,
  kapi_ofseti numeric(5, 2),
  kapi_genisligi numeric(4, 2),
  CONSTRAINT atolye_alan_tur_degeri CHECK (tur IN ('yuruyus_yolu', 'bolge', 'karantina', 'sevkiyat', 'oda', 'cam_oda', 'palet')),
  CONSTRAINT atolye_alan_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_alan_donus CHECK (donus >= 0 AND donus < 360),
  CONSTRAINT atolye_alan_olcusu CHECK (genislik BETWEEN 0.2 AND 500 AND derinlik BETWEEN 0.2 AND 500),
  CONSTRAINT atolye_alan_kapi_butun CHECK ((kapi_kenari IS NULL) = (kapi_ofseti IS NULL) AND (kapi_kenari IS NULL) = (kapi_genisligi IS NULL)),
  CONSTRAINT atolye_alan_kapi_odada CHECK (kapi_kenari IS NULL OR tur IN ('oda', 'cam_oda')),
  CONSTRAINT atolye_alan_kapi_kenari CHECK (kapi_kenari IS NULL OR kapi_kenari IN ('on', 'arka', 'sol', 'sag')),
  -- Kapı kenarın içindedir: ofset kenarın ortasından, kapının yarısı kenarın ucunu geçmez.
  CONSTRAINT atolye_alan_kapi_kenarda CHECK (
    kapi_kenari IS NULL OR (
      kapi_genisligi BETWEEN 0.5 AND 10 AND
      abs(kapi_ofseti) + kapi_genisligi / 2 <= (CASE WHEN kapi_kenari IN ('on', 'arka') THEN genislik ELSE derinlik END) / 2
    )
  )
);
CREATE INDEX atolye_alan_salon_idx ON atolye_alan (salon_id);

CREATE TABLE atolye_duvar (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salon_id int NOT NULL REFERENCES atolye_salon,
  bas_x numeric(6, 2) NOT NULL,
  bas_z numeric(6, 2) NOT NULL,
  son_x numeric(6, 2) NOT NULL,
  son_z numeric(6, 2) NOT NULL,
  kalinlik numeric(3, 2) NOT NULL,
  cam boolean NOT NULL DEFAULT false,
  CONSTRAINT atolye_duvar_uzunlugu CHECK (bas_x <> son_x OR bas_z <> son_z),
  CONSTRAINT atolye_duvar_kalinligi CHECK (kalinlik BETWEEN 0.05 AND 1)
);
CREATE INDEX atolye_duvar_salon_idx ON atolye_duvar (salon_id);

-- Dönmüş dikdörtgenin dört köşesi salonun içinde mi (1 cm pay). Kural katmanındaki denetimin veritabanı güvencesi.
-- Parametreler konumla anılır: adla anılınca salon tablosunun aynı adlı sütunları (genislik, derinlik) öne geçer.
CREATE FUNCTION atolye_salonda(salon int, x numeric, z numeric, donus numeric, genislik numeric, derinlik numeric)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT bool_and(
           $2 + k.sx * $5 / 2 * cos(radians($4)) - k.sz * $6 / 2 * sin(radians($4)) BETWEEN -0.01 AND s.genislik + 0.01
       AND $3 + k.sx * $5 / 2 * sin(radians($4)) + k.sz * $6 / 2 * cos(radians($4)) BETWEEN -0.01 AND s.derinlik + 0.01)
    FROM atolye_salon s, (VALUES (-1, -1), (1, -1), (1, 1), (-1, 1)) AS k (sx, sz)
   WHERE s.id = $1
$$;

-- Denetim işlem sonundadır: yerleşim kaydı salonu küçültüp öğeleri aynı transaction'da taşıyabilir.
CREATE FUNCTION atolye_salon_icinde() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  disarida text;
BEGIN
  IF TG_TABLE_NAME = 'atolye_salon' THEN
    SELECT string_agg(o, ', ') INTO disarida FROM (
      SELECT 'istasyon ' || istasyon_id AS o FROM atolye_istasyon_yeri y
       WHERE y.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, y.x, y.z, y.donus, y.genislik, y.derinlik)
      UNION ALL
      SELECT 'raf ' || r.kod FROM atolye_raf r
       WHERE r.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, r.x, r.z, r.donus, r.bolme_sayisi * r.bolme_genisligi, r.derinlik)
      UNION ALL
      SELECT 'alan ' || a.ad FROM atolye_alan a
       WHERE a.salon_id = NEW.id AND NOT atolye_salonda(NEW.id, a.x, a.z, a.donus, a.genislik, a.derinlik)
      UNION ALL
      SELECT 'duvar ' || d.id FROM atolye_duvar d
       WHERE d.salon_id = NEW.id AND NOT (least(d.bas_x, d.son_x) >= -0.01 AND greatest(d.bas_x, d.son_x) <= NEW.genislik + 0.01
         AND least(d.bas_z, d.son_z) >= -0.01 AND greatest(d.bas_z, d.son_z) <= NEW.derinlik + 0.01)
    ) t;
  ELSIF TG_TABLE_NAME = 'atolye_istasyon_yeri' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.genislik, NEW.derinlik) THEN
      disarida := 'istasyon ' || NEW.istasyon_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_raf' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.bolme_sayisi * NEW.bolme_genisligi, NEW.derinlik) THEN
      disarida := 'raf ' || NEW.kod;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_alan' THEN
    IF NOT atolye_salonda(NEW.salon_id, NEW.x, NEW.z, NEW.donus, NEW.genislik, NEW.derinlik) THEN
      disarida := 'alan ' || NEW.ad;
    END IF;
  ELSIF TG_TABLE_NAME = 'atolye_duvar' THEN
    IF NOT EXISTS (SELECT 1 FROM atolye_salon s WHERE s.id = NEW.salon_id
         AND least(NEW.bas_x, NEW.son_x) >= -0.01 AND greatest(NEW.bas_x, NEW.son_x) <= s.genislik + 0.01
         AND least(NEW.bas_z, NEW.son_z) >= -0.01 AND greatest(NEW.bas_z, NEW.son_z) <= s.derinlik + 0.01) THEN
      disarida := 'duvar';
    END IF;
  END IF;
  IF disarida IS NOT NULL THEN
    RAISE EXCEPTION 'Öğe salonun dışına taşıyor: %', disarida
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_salon_icinde';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER atolye_salon_icinde AFTER UPDATE OF genislik, derinlik ON atolye_salon
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();
CREATE CONSTRAINT TRIGGER atolye_istasyon_yeri_salon_icinde AFTER INSERT OR UPDATE ON atolye_istasyon_yeri
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();
CREATE CONSTRAINT TRIGGER atolye_raf_salon_icinde AFTER INSERT OR UPDATE ON atolye_raf
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();
CREATE CONSTRAINT TRIGGER atolye_alan_salon_icinde AFTER INSERT OR UPDATE ON atolye_alan
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();
CREATE CONSTRAINT TRIGGER atolye_duvar_salon_icinde AFTER INSERT OR UPDATE ON atolye_duvar
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_salon_icinde();

-- Göz rafın ölçüsünü aşmaz; raf küçülünce dışarıda kalan göz aynı transaction'da silinmiş olmalıdır.
CREATE FUNCTION atolye_goz_rafta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tasan int;
BEGIN
  IF TG_TABLE_NAME = 'atolye_raf' THEN
    SELECT count(*) INTO tasan FROM atolye_goz g
     WHERE g.raf_id = NEW.id AND (g.bolme > NEW.bolme_sayisi OR g.kat > NEW.kat_sayisi OR g.goz > NEW.goz_sayisi);
  ELSE
    SELECT count(*) INTO tasan FROM atolye_raf r
     WHERE r.id = NEW.raf_id AND (NEW.bolme > r.bolme_sayisi OR NEW.kat > r.kat_sayisi OR NEW.goz > r.goz_sayisi);
  END IF;
  IF tasan > 0 THEN
    RAISE EXCEPTION 'Göz rafın ölçüsünü aşıyor' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_goz_rafta';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER atolye_goz_rafta AFTER INSERT OR UPDATE ON atolye_goz
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_goz_rafta();
CREATE CONSTRAINT TRIGGER atolye_raf_gozleri AFTER UPDATE OF bolme_sayisi, kat_sayisi, goz_sayisi ON atolye_raf
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_goz_rafta();

-- Raf silinmez (pasife alınır); salon silinmez. Göz ve diğer öğeler yerleşim kaydında silinebilir.
CREATE FUNCTION atolye_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% kaydı silinmez; pasife alınır', TG_TABLE_NAME USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_silinmez';
END $$;
CREATE TRIGGER atolye_raf_silinmez BEFORE DELETE ON atolye_raf FOR EACH ROW EXECUTE FUNCTION atolye_silinmez();
CREATE TRIGGER atolye_salon_silinmez BEFORE DELETE ON atolye_salon FOR EACH ROW EXECUTE FUNCTION atolye_silinmez();

-- Sürüm yalnız birer artar; kaydı yapan sürümü düşüremez ya da atlayamaz.
CREATE FUNCTION atolye_salon_surum_sirasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.surum <> OLD.surum + 1 THEN
    RAISE EXCEPTION 'Salon sürümü birer artar (beklenen %, gelen %)', OLD.surum + 1, NEW.surum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_salon_surum_sirasi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_salon_surum_sirasi BEFORE UPDATE ON atolye_salon FOR EACH ROW EXECUTE FUNCTION atolye_salon_surum_sirasi();
