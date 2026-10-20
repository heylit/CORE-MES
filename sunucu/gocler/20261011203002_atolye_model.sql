-- Atölye 3B model kütüphanesi: istasyona atanan gerçek makine modeli. Dosya GLB 2.0'dır (STEP, STL ve GLTF istemcide
-- GLB'ye çevrilir) ve veritabanında 512 KiB'lık parçalarla durur (uç gövdesi 1 MiB ile sınırlı). Yükleme bitince
-- (tamam) dosya değişmez; yerleşim ayarı (ad, birim, yukarı eksen, dönüş, sığdırma) sürümle değişir.

CREATE TABLE atolye_model (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL,
  -- Yüklenen dosyanın özgün biçimi (bilgi); saklanan her zaman GLB'dir.
  kaynak_bicim text NOT NULL,
  boyut_bayt int NOT NULL,
  parca_sayisi int NOT NULL,
  -- Saklanan GLB'nin SHA-256 özeti (küçük harf onaltılık); tamamlanırken veritabanı yeniden hesaplar.
  ozet text NOT NULL,
  ucgen_sayisi int NOT NULL,
  birim text NOT NULL,
  yukari_eksen text NOT NULL,
  donus numeric(4, 1) NOT NULL DEFAULT 0,
  -- true: model istasyonun ayak izine sığacak ölçekte gösterilir; false: birimiyle gerçek ölçüsünde.
  sigdir boolean NOT NULL DEFAULT true,
  tamam boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1,
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atolye_model_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_model_kaynak_bicim CHECK (kaynak_bicim IN ('step', 'stl', 'glb', 'gltf')),
  CONSTRAINT atolye_model_boyutu CHECK (boyut_bayt BETWEEN 20 AND 26214400),
  CONSTRAINT atolye_model_parca_sayisi CHECK (parca_sayisi = (boyut_bayt + 524287) / 524288),
  CONSTRAINT atolye_model_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  CONSTRAINT atolye_model_ucgen_sayisi CHECK (ucgen_sayisi >= 0),
  CONSTRAINT atolye_model_birim CHECK (birim IN ('mm', 'cm', 'm')),
  CONSTRAINT atolye_model_yukari_eksen CHECK (yukari_eksen IN ('y', 'z')),
  CONSTRAINT atolye_model_donus CHECK (donus >= 0 AND donus < 360),
  CONSTRAINT atolye_model_surum_pozitif CHECK (surum >= 1)
);
CREATE INDEX atolye_model_kaydeden_idx ON atolye_model (kaydeden_kisi_id);

CREATE TABLE atolye_model_parca (
  model_id int NOT NULL REFERENCES atolye_model ON DELETE CASCADE,
  sira int NOT NULL,
  veri bytea NOT NULL,
  PRIMARY KEY (model_id, sira),
  CONSTRAINT atolye_model_parca_sirasi CHECK (sira >= 0),
  CONSTRAINT atolye_model_parca_boyu CHECK (octet_length(veri) BETWEEN 1 AND 524288)
);

-- İstasyonun gösterilen modeli (boşsa istasyon tipinden çizilen gövde). Atanmış model silinemez (yabancı anahtar).
ALTER TABLE atolye_istasyon_yeri ADD COLUMN model_id int REFERENCES atolye_model;
CREATE INDEX atolye_istasyon_yeri_model_idx ON atolye_istasyon_yeri (model_id);

-- Parça yalnız yüklemesi sürmekte olan modele yazılır ya da ondan silinir; sıra parça sayısını aşmaz.
-- Model silinirken (cascade) model satırı artık yoktur: parça silinmesi geçer.
CREATE FUNCTION atolye_model_parca_yazimi() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m atolye_model%ROWTYPE;
BEGIN
  SELECT * INTO m FROM atolye_model WHERE id = COALESCE(NEW.model_id, OLD.model_id);
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Model bulunamadı' USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'atolye_model_parca_model_id_fkey';
  END IF;
  IF m.tamam THEN
    RAISE EXCEPTION 'Tamamlanmış modelin dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_model_degismez';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.sira >= m.parca_sayisi THEN
    RAISE EXCEPTION 'Parça sırası parça sayısını aşıyor (% >= %)', NEW.sira, m.parca_sayisi
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_model_parca_sirasi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_model_parca_yazimi BEFORE INSERT OR UPDATE OR DELETE ON atolye_model_parca
  FOR EACH ROW EXECUTE FUNCTION atolye_model_parca_yazimi();

-- Tamamlama: bütün parçalar gelmiş, toplam boyut ve SHA-256 özeti tutuyor, dosya GLB 2.0 ve başlıktaki uzunluk
-- dosyanın kendisi. Tamamlanmış modelin dosya alanları değişmez, tamam geri alınmaz; sürüm birer artar.
CREATE FUNCTION atolye_model_guncelleme() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  adet int;
  toplam bigint;
  dosya_ozeti text;
  bas bytea;
BEGIN
  IF NEW.surum <> OLD.surum + 1 THEN
    RAISE EXCEPTION 'Model sürümü birer artar (beklenen %, gelen %)', OLD.surum + 1, NEW.surum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_model_surum_sirasi';
  END IF;
  IF OLD.tamam AND (NOT NEW.tamam OR NEW.boyut_bayt <> OLD.boyut_bayt OR NEW.parca_sayisi <> OLD.parca_sayisi
      OR NEW.ozet <> OLD.ozet OR NEW.kaynak_bicim <> OLD.kaynak_bicim OR NEW.ucgen_sayisi <> OLD.ucgen_sayisi) THEN
    RAISE EXCEPTION 'Tamamlanmış modelin dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_model_degismez';
  END IF;
  IF NEW.tamam AND NOT OLD.tamam THEN
    SELECT count(*), COALESCE(sum(octet_length(veri)), 0) INTO adet, toplam FROM atolye_model_parca WHERE model_id = NEW.id;
    SELECT encode(sha256(string_agg(veri, ''::bytea ORDER BY sira)), 'hex') INTO dosya_ozeti
      FROM atolye_model_parca WHERE model_id = NEW.id;
    SELECT substring(veri FROM 1 FOR 12) INTO bas FROM atolye_model_parca WHERE model_id = NEW.id AND sira = 0;
    IF adet <> NEW.parca_sayisi OR toplam <> NEW.boyut_bayt OR dosya_ozeti IS DISTINCT FROM NEW.ozet
        OR bas IS NULL OR octet_length(bas) < 12
        OR substring(bas FROM 1 FOR 4) <> '\x676c5446'::bytea
        OR get_byte(bas, 4) + get_byte(bas, 5) * 256 + get_byte(bas, 6) * 65536 + get_byte(bas, 7)::bigint * 16777216 <> 2
        OR get_byte(bas, 8) + get_byte(bas, 9) * 256 + get_byte(bas, 10) * 65536 + get_byte(bas, 11)::bigint * 16777216 <> NEW.boyut_bayt THEN
      RAISE EXCEPTION 'Model dosyası eksik ya da bozuk' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_model_dosyasi';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_model_guncelleme BEFORE UPDATE ON atolye_model FOR EACH ROW EXECUTE FUNCTION atolye_model_guncelleme();

-- İstasyona yalnız tamamlanmış model atanır.
CREATE FUNCTION atolye_istasyon_modeli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.model_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atolye_model WHERE id = NEW.model_id AND tamam) THEN
    RAISE EXCEPTION 'Modelin yüklemesi tamamlanmamış' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_istasyon_modeli';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atolye_istasyon_modeli BEFORE INSERT OR UPDATE OF model_id ON atolye_istasyon_yeri
  FOR EACH ROW EXECUTE FUNCTION atolye_istasyon_modeli();
