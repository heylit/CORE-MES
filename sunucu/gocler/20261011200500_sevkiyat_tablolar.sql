-- Sevkiyat: teslim/alış noktaları, araçlar, günün işleri ve gün planı; kurallar kısıtla da korunur.

CREATE TABLE sevkiyat_noktasi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  tur text NOT NULL CHECK (tur IN ('fabrika', 'musteri', 'tedarikci', 'fason', 'kargo', 'diger')),
  enlem numeric(9, 6) NOT NULL CHECK (enlem BETWEEN -90 AND 90),
  boylam numeric(9, 6) NOT NULL CHECK (boylam BETWEEN -180 AND 180),
  adres text CHECK (btrim(adres) <> ''),
  durak_suresi_dakika int NOT NULL DEFAULT 20,
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT sevkiyat_noktasi_durak_suresi CHECK (durak_suresi_dakika BETWEEN 0 AND 240)
);
-- Rotaların çıkış ve dönüş noktası tektir.
CREATE UNIQUE INDEX sevkiyat_noktasi_tek_fabrika ON sevkiyat_noktasi ((true)) WHERE tur = 'fabrika' AND aktif;
CREATE UNIQUE INDEX sevkiyat_noktasi_ad ON sevkiyat_noktasi (lower(ad)) WHERE aktif;

CREATE TABLE sevkiyat_araci (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  tur text NOT NULL CHECK (tur IN ('binek', 'kamyonet', 'kamyon')),
  plaka text CHECK (btrim(plaka) <> ''),
  kapasite_kilogram numeric(10, 2) NOT NULL CHECK (kapasite_kilogram > 0),
  kapasite_palet int NOT NULL CHECK (kapasite_palet >= 0),
  musait_baslangic time NOT NULL,
  musait_bitis time NOT NULL,
  -- Boşsa araç türünün örnek değeri kullanılır.
  kilometre_maliyeti numeric(10, 2) CHECK (kilometre_maliyeti >= 0),
  saat_maliyeti numeric(10, 2) CHECK (saat_maliyeti >= 0),
  gunluk_maliyet numeric(10, 2) CHECK (gunluk_maliyet >= 0),
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT sevkiyat_araci_musaitlik CHECK (musait_bitis > musait_baslangic)
);
CREATE UNIQUE INDEX sevkiyat_araci_ad ON sevkiyat_araci (lower(ad)) WHERE aktif;
CREATE UNIQUE INDEX sevkiyat_araci_plaka ON sevkiyat_araci (upper(plaka)) WHERE plaka IS NOT NULL AND aktif;

CREATE TABLE sevkiyat_isi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tarih date NOT NULL,
  tur text NOT NULL CHECK (tur IN ('teslimat', 'alim', 'aktarma')),
  alis_noktasi_id int REFERENCES sevkiyat_noktasi,
  birakis_noktasi_id int REFERENCES sevkiyat_noktasi,
  agirlik_kilogram numeric(10, 2) NOT NULL CHECK (agirlik_kilogram >= 0),
  palet_sayisi int NOT NULL CHECK (palet_sayisi >= 0),
  -- Boşsa noktanın durak süresi.
  durak_suresi_dakika int CHECK (durak_suresi_dakika BETWEEN 0 AND 240),
  alis_en_erken time,
  alis_en_gec time,
  birakis_en_erken time,
  birakis_en_gec time,
  belge_no text CHECK (btrim(belge_no) <> ''),
  aciklama text CHECK (btrim(aciklama) <> ''),
  sabit_arac_id int REFERENCES sevkiyat_araci,
  iptal_edildi timestamptz,
  CONSTRAINT sevkiyat_isi_yuk CHECK (agirlik_kilogram > 0 OR palet_sayisi > 0),
  -- Teslimat fabrikadan yüklenir, alım fabrikaya getirilir, al-bırak iki ayrı nokta arasındadır.
  CONSTRAINT sevkiyat_isi_noktalar CHECK (
    (tur = 'teslimat' AND alis_noktasi_id IS NULL AND birakis_noktasi_id IS NOT NULL)
    OR (tur = 'alim' AND alis_noktasi_id IS NOT NULL AND birakis_noktasi_id IS NULL)
    OR (tur = 'aktarma' AND alis_noktasi_id IS NOT NULL AND birakis_noktasi_id IS NOT NULL AND alis_noktasi_id <> birakis_noktasi_id)
  ),
  CONSTRAINT sevkiyat_isi_alis_araligi CHECK ((alis_en_erken IS NULL) = (alis_en_gec IS NULL) AND (alis_en_erken IS NULL OR alis_en_erken < alis_en_gec)),
  CONSTRAINT sevkiyat_isi_birakis_araligi CHECK ((birakis_en_erken IS NULL) = (birakis_en_gec IS NULL) AND (birakis_en_erken IS NULL OR birakis_en_erken < birakis_en_gec)),
  CONSTRAINT sevkiyat_isi_alis_araligi_turu CHECK (alis_en_erken IS NULL OR tur <> 'teslimat'),
  CONSTRAINT sevkiyat_isi_birakis_araligi_turu CHECK (birakis_en_erken IS NULL OR tur <> 'alim'),
  CONSTRAINT sevkiyat_isi_tarihli UNIQUE (id, tarih)
);
CREATE INDEX sevkiyat_isi_tarih ON sevkiyat_isi (tarih) WHERE iptal_edildi IS NULL;

CREATE TABLE sevkiyat_plani (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tarih date NOT NULL UNIQUE,
  amac text NOT NULL CHECK (amac IN ('sure', 'mesafe', 'maliyet')),
  -- Eşzamanlı düzenlemede son yazanın öncekini ezmemesi için her yazmada artar.
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  onaylandi timestamptz,
  CONSTRAINT sevkiyat_plani_tarihli UNIQUE (id, tarih)
);

CREATE TABLE sevkiyat_plan_araci (
  plan_id int NOT NULL REFERENCES sevkiyat_plani ON DELETE CASCADE,
  arac_id int NOT NULL REFERENCES sevkiyat_araci,
  -- Kilitli aracın rotası otomatik dağıtmada korunur, yeni iş almaz.
  kilitli boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, arac_id)
);

-- Rotanın sıralı durakları; iş satırı işin bir ucudur (alis), boş satır fabrikaya ara dönüştür.
CREATE TABLE sevkiyat_plan_duragi (
  plan_id int NOT NULL,
  arac_id int NOT NULL,
  sira int NOT NULL CHECK (sira >= 1),
  tarih date NOT NULL,
  is_id int,
  alis boolean,
  -- Onay anında hesaplanan saatler; taslakta boştur.
  tahmini_varis timestamptz,
  tahmini_ayrilis timestamptz,
  PRIMARY KEY (plan_id, arac_id, sira),
  FOREIGN KEY (plan_id, arac_id) REFERENCES sevkiyat_plan_araci ON DELETE CASCADE,
  -- Plan ve iş aynı güne aittir.
  CONSTRAINT sevkiyat_plan_duragi_plan_tarihi FOREIGN KEY (plan_id, tarih) REFERENCES sevkiyat_plani (id, tarih) ON DELETE CASCADE,
  CONSTRAINT sevkiyat_plan_duragi_is_tarihi FOREIGN KEY (is_id, tarih) REFERENCES sevkiyat_isi (id, tarih),
  CONSTRAINT sevkiyat_plan_duragi_ara_donus CHECK ((is_id IS NULL) = (alis IS NULL)),
  CONSTRAINT sevkiyat_plan_duragi_saatler CHECK (tahmini_ayrilis IS NULL OR tahmini_varis IS NOT NULL),
  -- İşin her ucu planda en çok bir kez yer alır.
  CONSTRAINT sevkiyat_plan_duragi_tek_uc UNIQUE (plan_id, is_id, alis)
);

-- Onaylı planın araçları ve durakları değişmez; değiştirmek için önce onay kaldırılır.
CREATE FUNCTION sevkiyat_onayli_plan_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  hedef int := CASE WHEN TG_OP = 'DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM sevkiyat_plani WHERE id = hedef AND onaylandi IS NOT NULL) THEN
    RAISE EXCEPTION 'Onaylı sevkiyat planı değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plan_degismez';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER sevkiyat_plan_araci_onayli BEFORE INSERT OR UPDATE OR DELETE ON sevkiyat_plan_araci
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_onayli_plan_degismez();
CREATE TRIGGER sevkiyat_plan_duragi_onayli BEFORE INSERT OR UPDATE OR DELETE ON sevkiyat_plan_duragi
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_onayli_plan_degismez();

-- Onaylı plandaki iş değişmez ve iptal edilmez.
CREATE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sevkiyat_plan_duragi d JOIN sevkiyat_plani p ON p.id = d.plan_id
     WHERE d.is_id = OLD.id AND p.onaylandi IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Onaylı plandaki iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sevkiyat_isi_onayli_planda BEFORE UPDATE ON sevkiyat_isi
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_onayli_plandaki_is_degismez();

-- Onaylı plan satırı değişmez ve silinmez; yalnız onay kaldırılabilir (gün ve amaç aynı kalır).
CREATE FUNCTION sevkiyat_onayli_plan_satiri_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.onaylandi IS NOT NULL AND (TG_OP = 'DELETE' OR NEW.onaylandi IS NOT NULL OR NEW.tarih <> OLD.tarih OR NEW.amac <> OLD.amac) THEN
    RAISE EXCEPTION 'Onaylı sevkiyat planı değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plan_satiri_degismez';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER sevkiyat_plani_onayli BEFORE UPDATE OR DELETE ON sevkiyat_plani
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_onayli_plan_satiri_degismez();

-- İşin noktası fabrika olamaz; yeni ya da değişen nokta aktif olmalı.
CREATE FUNCTION sevkiyat_isi_noktalari_gecerli() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  nokta_id int;
BEGIN
  FOREACH nokta_id IN ARRAY ARRAY[NEW.alis_noktasi_id, NEW.birakis_noktasi_id] LOOP
    CONTINUE WHEN nokta_id IS NULL;
    IF TG_OP = 'UPDATE' AND nokta_id IN (OLD.alis_noktasi_id, OLD.birakis_noktasi_id) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM sevkiyat_noktasi WHERE id = nokta_id AND tur = 'fabrika') THEN
      RAISE EXCEPTION 'Fabrika işin noktası olamaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_isi_fabrika_noktasi';
    END IF;
    IF EXISTS (SELECT 1 FROM sevkiyat_noktasi WHERE id = nokta_id AND NOT aktif) THEN
      RAISE EXCEPTION 'Pasif nokta işe seçilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_isi_pasif_nokta';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER sevkiyat_isi_noktalari BEFORE INSERT OR UPDATE OF alis_noktasi_id, birakis_noktasi_id ON sevkiyat_isi
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_isi_noktalari_gecerli();

-- İptal edilmemiş bir işte kullanılan nokta fabrikaya çevrilemez.
CREATE FUNCTION sevkiyat_noktasi_fabrikaya_cevrilmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tur = 'fabrika' AND OLD.tur <> 'fabrika' AND EXISTS (
    SELECT 1 FROM sevkiyat_isi WHERE iptal_edildi IS NULL AND (alis_noktasi_id = NEW.id OR birakis_noktasi_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'İşte kullanılan nokta fabrika yapılamaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_noktasi_iste_kullaniliyor';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sevkiyat_noktasi_tur_degisimi BEFORE UPDATE OF tur ON sevkiyat_noktasi
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_noktasi_fabrikaya_cevrilmez();

-- Plandaki uç işin türüne uygun (teslimatta yalnız bırakış, alımda yalnız alış) ve iş iptal edilmemiş olmalı.
CREATE FUNCTION sevkiyat_plan_duragi_ucu_gecerli() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_turu text;
  iptal timestamptz;
BEGIN
  IF NEW.is_id IS NULL THEN RETURN NEW; END IF;
  SELECT tur, iptal_edildi INTO is_turu, iptal FROM sevkiyat_isi WHERE id = NEW.is_id;
  IF (NEW.alis AND is_turu = 'teslimat') OR (NOT NEW.alis AND is_turu = 'alim') THEN
    RAISE EXCEPTION 'İşin bu ucu yok' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_plan_duragi_uc_turu';
  END IF;
  IF iptal IS NOT NULL THEN
    RAISE EXCEPTION 'İptal edilen iş plana giremez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_plan_duragi_iptal_is';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sevkiyat_plan_duragi_ucu BEFORE INSERT OR UPDATE OF is_id, alis ON sevkiyat_plan_duragi
  FOR EACH ROW EXECUTE FUNCTION sevkiyat_plan_duragi_ucu_gecerli();
