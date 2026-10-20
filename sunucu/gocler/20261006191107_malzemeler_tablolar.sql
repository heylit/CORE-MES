-- Malzeme kartı: katalog tanımları ve kartlar; iş kuralları mümkün olduğunca kısıtta, uygulama atlansa da korunur.

CREATE TABLE malzeme_ailesi (
  kod text PRIMARY KEY CHECK (kod ~ '^[a-z]{2,20}$'),
  ad text NOT NULL UNIQUE CHECK (btrim(ad) <> ''),
  sira int NOT NULL
);

-- Stok kodunun orta parçası; sıra numarası grup içinde artar.
CREATE TABLE kod_grubu (
  kod text PRIMARY KEY CHECK (kod ~ '^[A-Z0-9]{3}$'),
  son_sira int NOT NULL DEFAULT 0 CHECK (son_sira >= 0)
);

CREATE TABLE malzeme_sinifi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aile_kodu text NOT NULL REFERENCES malzeme_ailesi,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  grup_kodu text NOT NULL UNIQUE REFERENCES kod_grubu,
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT malzeme_sinifi_ad_tek UNIQUE (aile_kodu, ad),
  CONSTRAINT malzeme_sinifi_aile_id UNIQUE (aile_kodu, id)
);

CREATE TABLE kalite (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aile_kodu text NOT NULL,
  sinif_id int NOT NULL,
  kod text NOT NULL CHECK (kod ~ '^[A-Z0-9][A-Z0-9.+/-]{0,23}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  ana_standart text CHECK (ana_standart IS NULL OR btrim(ana_standart) <> ''),
  -- g/cm3; yoksa birim ağırlık hesaplanmaz. Üst sınır sözleşmeyle aynıdır; ağırlık sütunu bu sınıra göre boyutlanmıştır.
  yogunluk numeric(6,3) CONSTRAINT kalite_yogunluk_aralik CHECK (yogunluk > 0 AND yogunluk <= 100),
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT kalite_sinifi FOREIGN KEY (aile_kodu, sinif_id) REFERENCES malzeme_sinifi (aile_kodu, id),
  CONSTRAINT kalite_kod_tek UNIQUE (aile_kodu, kod),
  CONSTRAINT kalite_aile_id UNIQUE (aile_kodu, id)
);

CREATE TABLE kalite_esdegeri (
  kalite_id int NOT NULL REFERENCES kalite,
  sistem text NOT NULL CHECK (btrim(sistem) <> ''),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  -- Tam karşılık değil; aramada kalite tanımaz, yalnız bilgi olarak gösterilir.
  yaklasik boolean NOT NULL DEFAULT false,
  PRIMARY KEY (kalite_id, sistem, ad)
);

-- Form ve ölçüleri sabittir: ağırlık formülü kurallar.ts içindedir, formsuz formül olmaz.
CREATE TABLE form (
  kod text PRIMARY KEY CHECK (kod ~ '^[a-z]{2,20}$'),
  ad text NOT NULL UNIQUE CHECK (btrim(ad) <> ''),
  sira int NOT NULL
);

CREATE TABLE form_olcusu (
  form_kodu text NOT NULL REFERENCES form,
  kod text NOT NULL CHECK (kod ~ '^[A-Za-z][A-Za-z0-9]{0,3}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  birim text NOT NULL CHECK (birim IN ('mm', 'm', 'kg', 'g/m2')),
  sira int NOT NULL,
  PRIMARY KEY (form_kodu, kod)
);

CREATE TABLE aile_formu (
  aile_kodu text NOT NULL REFERENCES malzeme_ailesi,
  form_kodu text NOT NULL REFERENCES form,
  PRIMARY KEY (aile_kodu, form_kodu)
);

-- Teslim durumu ve yüzey seçenekleri; sinif_id boşsa ailenin bütün sınıflarında geçerlidir.
CREATE TABLE secenek (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CHECK (tur IN ('durum', 'yuzey')),
  aile_kodu text NOT NULL REFERENCES malzeme_ailesi,
  sinif_id int,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT secenek_sinifi FOREIGN KEY (aile_kodu, sinif_id) REFERENCES malzeme_sinifi (aile_kodu, id),
  CONSTRAINT secenek_tur_aile_id UNIQUE (id, tur, aile_kodu)
);
CREATE UNIQUE INDEX secenek_tek ON secenek (tur, aile_kodu, COALESCE(sinif_id, 0), ad);

CREATE TABLE sarf_kategorisi (
  kod text PRIMARY KEY CHECK (kod ~ '^[a-z][a-z0-9_]{1,19}$'),
  ad text NOT NULL UNIQUE CHECK (btrim(ad) <> ''),
  grup_kodu text NOT NULL UNIQUE REFERENCES kod_grubu,
  aktif boolean NOT NULL DEFAULT true
);

CREATE TABLE sarf_alani (
  kategori_kodu text NOT NULL REFERENCES sarf_kategorisi,
  kod text NOT NULL CHECK (kod ~ '^[a-z][a-z0-9_]{0,19}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  tip text NOT NULL CHECK (tip IN ('metin', 'sayi', 'secim', 'coklu')),
  birim text CHECK (birim IS NULL OR btrim(birim) <> ''),
  zorunlu boolean NOT NULL DEFAULT false,
  sira int NOT NULL,
  PRIMARY KEY (kategori_kodu, kod),
  CONSTRAINT sarf_alani_birim_sayida CHECK (birim IS NULL OR tip = 'sayi')
);

CREATE TABLE sarf_alan_secenegi (
  kategori_kodu text NOT NULL,
  alan_kodu text NOT NULL,
  deger text NOT NULL CHECK (btrim(deger) <> ''),
  sira int NOT NULL,
  PRIMARY KEY (kategori_kodu, alan_kodu, deger),
  FOREIGN KEY (kategori_kodu, alan_kodu) REFERENCES sarf_alani
);

-- Kart. Stok kodu onayda verilir ve değişmez; taslak, onaydaki ve iptal edilen kartın kodu yoktur.
CREATE TABLE malzeme (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CHECK (tur IN ('hammadde', 'sarf')),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  benzersiz_anahtar text NOT NULL CHECK (btrim(benzersiz_anahtar) <> ''),
  stok_birimi text NOT NULL,
  erp_kodu text CHECK (erp_kodu IS NULL OR (btrim(erp_kodu) = erp_kodu AND erp_kodu <> '')),
  -- En ağır kart: 100.000 mm x 100.000 mm x 100.000 m rulo, 100 g/cm3 = 10^14 kg; tam kısım 15 basamak.
  birim_agirlik_kg numeric(19, 4) CHECK (birim_agirlik_kg > 0),
  onay_durumu text NOT NULL DEFAULT 'taslak' CHECK (onay_durumu IN ('taslak', 'onayda', 'aktif', 'pasif', 'iptal')),
  grup_kodu text REFERENCES kod_grubu,
  sira_no int CHECK (sira_no > 0),
  stok_kodu text GENERATED ALWAYS AS (
    CASE WHEN sira_no IS NULL THEN NULL
         ELSE CASE tur WHEN 'hammadde' THEN 'HM' ELSE 'SF' END || '-' || grup_kodu || '-'
              || CASE WHEN sira_no < 100000 THEN lpad(sira_no::text, 5, '0') ELSE sira_no::text END
    END) STORED,
  mukerrer_gerekcesi text CHECK (mukerrer_gerekcesi IS NULL OR char_length(btrim(mukerrer_gerekcesi)) >= 10),
  yerine_malzeme_id bigint REFERENCES malzeme,
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  -- Onay dört göz ayarı kapalıyken verildiyse doğrudur; yalnız o zaman aşağıdaki dört göz güvenceleri aranmaz.
  dort_gozsuz_onay boolean NOT NULL DEFAULT false,
  gonderen_kisi_id int REFERENCES kisi,
  gonderme timestamptz,
  onaylayan_kisi_id int REFERENCES kisi,
  onaylama timestamptz,
  red_nedeni text CHECK (red_nedeni IS NULL OR btrim(red_nedeni) <> ''),
  pasif_nedeni text CHECK (pasif_nedeni IS NULL OR btrim(pasif_nedeni) <> ''),
  -- Son reddeden, pasife alan, iptal eden ve birleştiren; kart yeniden gönderilse ya da aktifleşse de kayıtta kalır.
  reddeden_kisi_id int REFERENCES kisi,
  reddetme timestamptz,
  pasife_alan_kisi_id int REFERENCES kisi,
  pasife_alma timestamptz,
  iptal_eden_kisi_id int REFERENCES kisi,
  iptal_etme timestamptz,
  birlestiren_kisi_id int REFERENCES kisi,
  birlestirme timestamptz,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT malzeme_id_tur UNIQUE (id, tur),
  CONSTRAINT malzeme_stok_kodu_tek UNIQUE (stok_kodu),
  CONSTRAINT malzeme_grup_sira_tek UNIQUE (grup_kodu, sira_no),
  CONSTRAINT malzeme_stok_birimi CHECK (
    (tur = 'hammadde' AND stok_birimi IN ('adet', 'kg', 'm', 'm²', 'levha', 'rulo', 'torba'))
    OR (tur = 'sarf' AND stok_birimi IN ('adet', 'kutu', 'paket', 'kg', 'L', 'm', 'makara', 'rulo', 'çift', 'takım', 'tüp'))),
  CONSTRAINT malzeme_grup_sira_birlikte CHECK ((grup_kodu IS NULL) = (sira_no IS NULL)),
  CONSTRAINT malzeme_kod_onayla_gelir CHECK ((sira_no IS NOT NULL) = (onay_durumu IN ('aktif', 'pasif'))),
  CONSTRAINT malzeme_dort_goz CHECK (onaylayan_kisi_id IS NULL OR dort_gozsuz_onay
    OR (onaylayan_kisi_id <> acan_kisi_id AND onaylayan_kisi_id <> gonderen_kisi_id)),
  CONSTRAINT malzeme_gonderilmis CHECK (onay_durumu <> 'onayda' OR (gonderen_kisi_id IS NOT NULL AND gonderme IS NOT NULL)),
  CONSTRAINT malzeme_onaylanmis CHECK (onay_durumu NOT IN ('aktif', 'pasif') OR (onaylayan_kisi_id IS NOT NULL AND onaylama IS NOT NULL)),
  CONSTRAINT malzeme_pasif_nedenli CHECK ((onay_durumu = 'pasif') = (pasif_nedeni IS NOT NULL)),
  CONSTRAINT malzeme_reddeden_butun CHECK ((reddeden_kisi_id IS NULL) = (reddetme IS NULL)),
  CONSTRAINT malzeme_pasife_alan_butun CHECK ((pasife_alan_kisi_id IS NULL) = (pasife_alma IS NULL)),
  CONSTRAINT malzeme_iptal_eden_butun CHECK ((iptal_eden_kisi_id IS NULL) = (iptal_etme IS NULL)),
  CONSTRAINT malzeme_birlestiren_butun CHECK ((birlestiren_kisi_id IS NULL) = (birlestirme IS NULL)),
  CONSTRAINT malzeme_pasife_alanli CHECK (onay_durumu <> 'pasif' OR pasife_alan_kisi_id IS NOT NULL),
  CONSTRAINT malzeme_iptal_edenli CHECK (onay_durumu <> 'iptal' OR iptal_eden_kisi_id IS NOT NULL),
  CONSTRAINT malzeme_birlestirenli CHECK (yerine_malzeme_id IS NULL OR birlestiren_kisi_id IS NOT NULL),
  CONSTRAINT malzeme_yerine_pasifte CHECK (yerine_malzeme_id IS NULL OR (onay_durumu = 'pasif' AND yerine_malzeme_id <> id))
);
-- Aynı malzemenin ikinci kartı açılamaz; pasif, iptal ve gerekçeli mükerrer kartlar hariç.
CREATE UNIQUE INDEX malzeme_anahtar_tek ON malzeme (benzersiz_anahtar)
  WHERE onay_durumu IN ('taslak', 'onayda', 'aktif') AND mukerrer_gerekcesi IS NULL;
CREATE UNIQUE INDEX malzeme_erp_kodu_tek ON malzeme (erp_kodu)
  WHERE erp_kodu IS NOT NULL AND onay_durumu IN ('taslak', 'onayda', 'aktif');
CREATE INDEX malzeme_durum ON malzeme (onay_durumu, guncelleme DESC);
CREATE INDEX malzeme_yerine ON malzeme (yerine_malzeme_id) WHERE yerine_malzeme_id IS NOT NULL;

-- Taslağı düzenleyen herkes. Dört göz kartta eli olan herkesi onaydan alıkoyar; liste birikir, silinmez.
CREATE TABLE malzeme_duzenleyen (
  malzeme_id bigint NOT NULL REFERENCES malzeme,
  kisi_id int NOT NULL REFERENCES kisi,
  ilk_duzenleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_id, kisi_id)
);
CREATE TRIGGER malzeme_duzenleyen_degismez BEFORE UPDATE OR DELETE ON malzeme_duzenleyen
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER malzeme_duzenleyen_bosaltilmaz BEFORE TRUNCATE ON malzeme_duzenleyen
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE malzeme_hammadde (
  malzeme_id bigint PRIMARY KEY,
  tur text NOT NULL DEFAULT 'hammadde' CHECK (tur = 'hammadde'),
  aile_kodu text NOT NULL,
  kalite_id int NOT NULL,
  form_kodu text NOT NULL,
  durum_id int,
  durum_turu text NOT NULL DEFAULT 'durum' CHECK (durum_turu = 'durum'),
  yuzey_id int,
  yuzey_turu text NOT NULL DEFAULT 'yuzey' CHECK (yuzey_turu = 'yuzey'),
  CONSTRAINT malzeme_hammadde_kart FOREIGN KEY (malzeme_id, tur) REFERENCES malzeme (id, tur),
  CONSTRAINT malzeme_hammadde_kalite FOREIGN KEY (aile_kodu, kalite_id) REFERENCES kalite (aile_kodu, id),
  CONSTRAINT malzeme_hammadde_form FOREIGN KEY (aile_kodu, form_kodu) REFERENCES aile_formu,
  CONSTRAINT malzeme_hammadde_durum FOREIGN KEY (durum_id, durum_turu, aile_kodu) REFERENCES secenek (id, tur, aile_kodu),
  CONSTRAINT malzeme_hammadde_yuzey FOREIGN KEY (yuzey_id, yuzey_turu, aile_kodu) REFERENCES secenek (id, tur, aile_kodu),
  CONSTRAINT malzeme_hammadde_kart_form UNIQUE (malzeme_id, form_kodu)
);
CREATE INDEX malzeme_hammadde_kalite_form ON malzeme_hammadde (kalite_id, form_kodu);

-- Ölçü kartın formuna aittir: başka formun ölçüsü yazılamaz.
CREATE TABLE malzeme_olcusu (
  malzeme_id bigint NOT NULL,
  form_kodu text NOT NULL,
  olcu_kodu text NOT NULL,
  deger numeric(12, 3) NOT NULL CONSTRAINT malzeme_olcusu_aralik CHECK (deger > 0 AND deger <= 100000),
  PRIMARY KEY (malzeme_id, olcu_kodu),
  CONSTRAINT malzeme_olcusu_kart FOREIGN KEY (malzeme_id, form_kodu) REFERENCES malzeme_hammadde (malzeme_id, form_kodu),
  CONSTRAINT malzeme_olcusu_formun FOREIGN KEY (form_kodu, olcu_kodu) REFERENCES form_olcusu
);

CREATE TABLE malzeme_sarf (
  malzeme_id bigint PRIMARY KEY,
  tur text NOT NULL DEFAULT 'sarf' CHECK (tur = 'sarf'),
  kategori_kodu text NOT NULL REFERENCES sarf_kategorisi,
  CONSTRAINT malzeme_sarf_kart FOREIGN KEY (malzeme_id, tur) REFERENCES malzeme (id, tur),
  CONSTRAINT malzeme_sarf_kart_kategori UNIQUE (malzeme_id, kategori_kodu)
);

-- Çoklu alanda her değer ayrı satırdır; tekli alanın tek değeri olduğunu kurallar.ts denetler.
CREATE TABLE malzeme_sarf_degeri (
  malzeme_id bigint NOT NULL,
  kategori_kodu text NOT NULL,
  alan_kodu text NOT NULL,
  deger text NOT NULL CHECK (btrim(deger) = deger AND deger <> ''),
  PRIMARY KEY (malzeme_id, alan_kodu, deger),
  CONSTRAINT malzeme_sarf_degeri_kart FOREIGN KEY (malzeme_id, kategori_kodu) REFERENCES malzeme_sarf (malzeme_id, kategori_kodu),
  CONSTRAINT malzeme_sarf_degeri_alan FOREIGN KEY (kategori_kodu, alan_kodu) REFERENCES sarf_alani
);

-- Kart silinmez; kullanılmayan kart pasife alınır, açılmaktan vazgeçilen taslak iptal edilir.
CREATE FUNCTION malzeme_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Malzeme kartı silinmez' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER malzeme_silinmez BEFORE DELETE ON malzeme FOR EACH ROW EXECUTE FUNCTION malzeme_silinmez();
CREATE TRIGGER malzeme_bosaltilmaz BEFORE TRUNCATE ON malzeme FOR EACH STATEMENT EXECUTE FUNCTION malzeme_silinmez();

-- Tanım yalnız taslakta değişir: onaya giden, onaylanan ya da kapanan kart başka bir malzemeye dönüşemez.
CREATE FUNCTION malzeme_tanimi_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kart bigint := CASE WHEN TG_OP = 'DELETE' THEN OLD.malzeme_id ELSE NEW.malzeme_id END;
  durum text;
BEGIN
  SELECT onay_durumu INTO durum FROM malzeme WHERE id = kart;
  IF durum IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION 'Malzeme tanımı yalnız taslakta değişir (kart %, durum %)', kart, durum USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER malzeme_hammadde_kilitli BEFORE INSERT OR UPDATE OR DELETE ON malzeme_hammadde
  FOR EACH ROW EXECUTE FUNCTION malzeme_tanimi_kilitli();
CREATE TRIGGER malzeme_olcusu_kilitli BEFORE INSERT OR UPDATE OR DELETE ON malzeme_olcusu
  FOR EACH ROW EXECUTE FUNCTION malzeme_tanimi_kilitli();
CREATE TRIGGER malzeme_sarf_kilitli BEFORE INSERT OR UPDATE OR DELETE ON malzeme_sarf
  FOR EACH ROW EXECUTE FUNCTION malzeme_tanimi_kilitli();
CREATE TRIGGER malzeme_sarf_degeri_kilitli BEFORE INSERT OR UPDATE OR DELETE ON malzeme_sarf_degeri
  FOR EACH ROW EXECUTE FUNCTION malzeme_tanimi_kilitli();

-- Kartın kendi satırında da tanımdan türeyen alanlar ve tür taslaktan sonra değişmez.
CREATE FUNCTION malzeme_karti_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tur <> OLD.tur THEN
    RAISE EXCEPTION 'Malzeme kartının türü değişmez' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.onay_durumu <> 'taslak' AND (NEW.ad, NEW.benzersiz_anahtar, NEW.birim_agirlik_kg, NEW.mukerrer_gerekcesi)
       IS DISTINCT FROM (OLD.ad, OLD.benzersiz_anahtar, OLD.birim_agirlik_kg, OLD.mukerrer_gerekcesi) THEN
    RAISE EXCEPTION 'Malzeme tanımı yalnız taslakta değişir (kart %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sira_no IS NOT NULL AND (NEW.grup_kodu, NEW.sira_no) IS DISTINCT FROM (OLD.grup_kodu, OLD.sira_no) THEN
    RAISE EXCEPTION 'Stok kodu değişmez (kart %)', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  -- Zincir olmaz: kendisine kart birleştirilmiş asıl kart pasife alınamaz, dolayısıyla başka karta da birleştirilemez.
  IF NEW.onay_durumu = 'pasif' AND OLD.onay_durumu <> 'pasif'
     AND EXISTS (SELECT 1 FROM malzeme b WHERE b.yerine_malzeme_id = NEW.id) THEN
    RAISE EXCEPTION 'Kendisine kart birleştirilmiş kart pasife alınamaz (kart %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_asil_pasif_olmaz';
  END IF;
  -- Düzenleyenler ayrı tablodadır, satır kısıtı göremez: onaylayan yazılırken burada bakılır.
  -- Açan ve gönderen için aynı kural malzeme_dort_goz kısıtındadır; ihlal aynı kısıt adıyla bildirilir.
  IF NEW.onaylayan_kisi_id IS NOT NULL AND NOT NEW.dort_gozsuz_onay AND NEW.onaylayan_kisi_id IS DISTINCT FROM OLD.onaylayan_kisi_id
     AND EXISTS (SELECT 1 FROM malzeme_duzenleyen d WHERE d.malzeme_id = NEW.id AND d.kisi_id = NEW.onaylayan_kisi_id) THEN
    RAISE EXCEPTION 'Kartı düzenleyen kişi onaylayamaz (kart %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_dort_goz';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER malzeme_karti_kilitli BEFORE UPDATE ON malzeme FOR EACH ROW EXECUTE FUNCTION malzeme_karti_kilitli();
