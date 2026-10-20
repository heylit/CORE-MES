-- Mamulün reçetesi ve rotası revizyonlarla tutulur. Revizyon silinmez (vazgeçilen taslak iptal olur); yalnız taslağın
-- içeriği değişir. OP numarası ürün içinde bir kez verilir ve hiç yeniden verilmez; talimat bu numaraya bağlıdır.

CREATE TABLE rota_revizyonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  -- Rota yalnız mamule kurulur: kart türüyle birlikte bağlanır, başka türde kart bağlanamaz.
  -- Kartın türü açılışta servisçe yazılır; malzemeler (no, tur) tekilini verince bileşik yabancı anahtar olur (UYUM-BORCU).
  malzeme_turu text NOT NULL CONSTRAINT rota_revizyonu_mamul_yarimamul CHECK (malzeme_turu IN ('mamul', 'yarimamul')),
  harf text NOT NULL CONSTRAINT rota_revizyonu_harf_bicimi CHECK (harf ~ '^[A-Z]{1,2}$'),
  durum text NOT NULL DEFAULT 'taslak'
    CONSTRAINT rota_revizyonu_durum_degeri CHECK (durum IN ('taslak', 'onay_bekliyor', 'onayli', 'yururlukte', 'iptal')),
  surum int NOT NULL DEFAULT 1 CONSTRAINT rota_revizyonu_surum_pozitif CHECK (surum > 0),
  aciklama text CONSTRAINT rota_revizyonu_aciklama_bicimi CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 300)),
  kaynak_revizyon_id int REFERENCES rota_revizyonu,
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  gonderen_kisi_id int REFERENCES kisi,
  gonderme timestamptz,
  onaylayan_kisi_id int REFERENCES kisi,
  onaylama timestamptz,
  -- Onay dört göz ayarı kapalıyken verildiyse doğrudur; yalnız o zaman dört göz güvenceleri aranmaz.
  dort_gozsuz_onay boolean NOT NULL DEFAULT false,
  yururluge_alan_kisi_id int REFERENCES kisi,
  yururluge_alma timestamptz,
  iptal_eden_kisi_id int REFERENCES kisi,
  iptal_etme timestamptz,
  CONSTRAINT rota_revizyonu_harf_tekil UNIQUE (malzeme_id, harf),
  CONSTRAINT rota_revizyonu_kimlik_urun UNIQUE (id, malzeme_id),
  CONSTRAINT rota_revizyonu_gonderen_butun CHECK ((gonderen_kisi_id IS NULL) = (gonderme IS NULL)),
  CONSTRAINT rota_revizyonu_onaylayan_butun CHECK ((onaylayan_kisi_id IS NULL) = (onaylama IS NULL)),
  CONSTRAINT rota_revizyonu_yururluge_alan_butun CHECK ((yururluge_alan_kisi_id IS NULL) = (yururluge_alma IS NULL)),
  CONSTRAINT rota_revizyonu_iptal_eden_butun CHECK ((iptal_eden_kisi_id IS NULL) = (iptal_etme IS NULL)),
  CONSTRAINT rota_revizyonu_gonderilmis CHECK (durum <> 'onay_bekliyor' OR gonderen_kisi_id IS NOT NULL),
  CONSTRAINT rota_revizyonu_onaylanmis CHECK (durum NOT IN ('onayli', 'yururlukte') OR onaylayan_kisi_id IS NOT NULL),
  CONSTRAINT rota_revizyonu_yururluge_alinmis CHECK (durum <> 'yururlukte' OR yururluge_alan_kisi_id IS NOT NULL),
  CONSTRAINT rota_revizyonu_iptal_edilmis CHECK ((durum = 'iptal') = (iptal_eden_kisi_id IS NOT NULL)),
  -- Gönderen onaylayamaz; düzenleyenler ayrı tablodadır, onlar tetikleyicide aynı adla denetlenir.
  CONSTRAINT rota_revizyonu_dort_goz CHECK (onaylayan_kisi_id IS NULL OR dort_gozsuz_onay OR onaylayan_kisi_id <> gonderen_kisi_id)
);
CREATE UNIQUE INDEX rota_revizyonu_tek_yururlukte ON rota_revizyonu (malzeme_id) WHERE durum = 'yururlukte';
CREATE UNIQUE INDEX rota_revizyonu_tek_acik ON rota_revizyonu (malzeme_id) WHERE durum IN ('taslak', 'onay_bekliyor');

-- Taslağı kaydeden herkes. Dört göz bu listedeki kişiyi onaydan alıkoyar; liste birikir, silinmez.
CREATE TABLE rota_revizyonu_duzenleyen (
  revizyon_id int NOT NULL REFERENCES rota_revizyonu,
  kisi_id int NOT NULL REFERENCES kisi,
  ilk_duzenleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revizyon_id, kisi_id)
);

-- Ürüne bir kez verilmiş OP numaraları. Kayıt silinmez: iptal taslakta kalan ya da kaydetmede silinen adımın
-- numarası da burada durur, yeni numara buradaki en büyüğün üstünden verilir.
CREATE TABLE rota_op_numarasi (
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  op_no int NOT NULL CONSTRAINT rota_op_numarasi_pozitif CHECK (op_no > 0),
  ilk_revizyon_id int NOT NULL REFERENCES rota_revizyonu,
  verilme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (malzeme_id, op_no)
);

CREATE TABLE rota_adimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revizyon_id int NOT NULL,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  sira int NOT NULL CONSTRAINT rota_adimi_sira_pozitif CHECK (sira > 0),
  -- Operasyon tipi istasyonlar modülündedir; tablosu gelince yabancı anahtar eklenir (UYUM-BORCU).
  operasyon_tipi_id int NOT NULL CONSTRAINT rota_adimi_tip_pozitif CHECK (operasyon_tipi_id > 0),
  ad text NOT NULL CONSTRAINT rota_adimi_ad_bicimi CHECK (btrim(ad) <> '' AND char_length(ad) <= 80),
  -- Operasyonu yapan kaynak bir makine ya da bir kişidir (istasyon onların grubudur). İkisi de boşsa kaynak henüz atanmamıştır.
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  -- Süre taslakta boş olabilir (sıfır uydurulmaz); onaya gönderirken dolu olmalıdır.
  ayar_suresi_dk numeric(8, 2) CONSTRAINT rota_adimi_ayar_suresi CHECK (ayar_suresi_dk >= 0),
  birim_sure_dk numeric(10, 4) CONSTRAINT rota_adimi_birim_sure CHECK (birim_sure_dk > 0),
  bagimlilik text NOT NULL DEFAULT 'bekleyen' CONSTRAINT rota_adimi_bagimlilik CHECK (bagimlilik IN ('bagimsiz', 'bekleyen', 'akisli')),
  devir_adedi int,
  fire_payi_yuzde numeric(5, 2) NOT NULL DEFAULT 0 CONSTRAINT rota_adimi_fire_payi CHECK (fire_payi_yuzde >= 0 AND fire_payi_yuzde <= 95),
  makine_kullanimi text NOT NULL DEFAULT 'tek' CONSTRAINT rota_adimi_makine_kullanimi CHECK (makine_kullanimi IN ('tek', 'paralel')),
  en_kucuk_parca int,
  yeniden_ayar boolean NOT NULL DEFAULT true,
  CONSTRAINT rota_adimi_revizyon FOREIGN KEY (revizyon_id, malzeme_id) REFERENCES rota_revizyonu (id, malzeme_id),
  CONSTRAINT rota_adimi_op_kayitli FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi,
  CONSTRAINT rota_adimi_op_tekil UNIQUE (revizyon_id, op_no),
  CONSTRAINT rota_adimi_sira_tekil UNIQUE (revizyon_id, sira) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT rota_adimi_tek_kaynak CHECK (makine_id IS NULL OR kisi_id IS NULL),
  CONSTRAINT rota_adimi_devir_tutarli CHECK ((bagimlilik = 'akisli') = (devir_adedi IS NOT NULL) AND (devir_adedi IS NULL OR devir_adedi > 0)),
  CONSTRAINT rota_adimi_parca_tutarli CHECK ((makine_kullanimi = 'paralel' OR en_kucuk_parca IS NULL) AND (en_kucuk_parca IS NULL OR en_kucuk_parca > 0))
);
CREATE INDEX rota_adimi_malzeme_op_idx ON rota_adimi (malzeme_id, op_no);

-- Aday kaynak: operasyonu yapabilecek öteki makine ya da kişi; boş süre adımın süresini alır.
CREATE TABLE rota_aday_kaynagi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim_id int NOT NULL REFERENCES rota_adimi,
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  ayar_suresi_dk numeric(8, 2) CONSTRAINT rota_aday_kaynagi_ayar_suresi CHECK (ayar_suresi_dk >= 0),
  birim_sure_dk numeric(10, 4) CONSTRAINT rota_aday_kaynagi_birim_sure CHECK (birim_sure_dk > 0),
  CONSTRAINT rota_aday_kaynagi_tek_kaynak CHECK ((makine_id IS NULL) <> (kisi_id IS NULL)),
  CONSTRAINT rota_aday_kaynagi_makine_tekil UNIQUE (adim_id, makine_id),
  CONSTRAINT rota_aday_kaynagi_kisi_tekil UNIQUE (adim_id, kisi_id)
);

-- Reçete satırı: bileşen bir adet ürün için, tükendiği adımda.
CREATE TABLE rota_bileseni (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim_id int NOT NULL REFERENCES rota_adimi,
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14, 4) NOT NULL CONSTRAINT rota_bileseni_miktar CHECK (miktar > 0),
  fire_yuzde numeric(5, 2) NOT NULL DEFAULT 0 CONSTRAINT rota_bileseni_fire CHECK (fire_yuzde >= 0 AND fire_yuzde <= 100),
  CONSTRAINT rota_bileseni_adimda_tekil UNIQUE (adim_id, malzeme_id)
);

CREATE TABLE rota_yan_urunu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim_id int NOT NULL REFERENCES rota_adimi,
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  miktar numeric(14, 4) NOT NULL CONSTRAINT rota_yan_urunu_miktar CHECK (miktar > 0)
);

-- Talimat revizyondan bağımsızdır, ürün ve OP numarasına bağlıdır; her yazı yeni sürümdür, eski sürüm kalır.
CREATE TABLE rota_talimati (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL,
  op_no int NOT NULL,
  surum int NOT NULL CONSTRAINT rota_talimati_surum_pozitif CHECK (surum > 0),
  metin text NOT NULL CONSTRAINT rota_talimati_metin_bicimi CHECK (btrim(metin) <> '' AND char_length(metin) <= 4000),
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_talimati_op_kayitli FOREIGN KEY (malzeme_id, op_no) REFERENCES rota_op_numarasi,
  CONSTRAINT rota_talimati_surum_tekil UNIQUE (malzeme_id, op_no, surum)
);

CREATE TRIGGER rota_revizyonu_duzenleyen_degismez BEFORE UPDATE OR DELETE ON rota_revizyonu_duzenleyen
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_revizyonu_duzenleyen_bosaltilmaz BEFORE TRUNCATE ON rota_revizyonu_duzenleyen
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_op_numarasi_degismez BEFORE UPDATE OR DELETE ON rota_op_numarasi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_op_numarasi_bosaltilmaz BEFORE TRUNCATE ON rota_op_numarasi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimati_degismez BEFORE UPDATE OR DELETE ON rota_talimati
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER rota_talimati_bosaltilmaz BEFORE TRUNCATE ON rota_talimati
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Revizyon silinmez; iptal son durumdur; durum yalnız izinli geçişle değişir; taslak dışında yalnız durum ve olay
-- sütunları yazılır. Düzenleyen kişi, ayar kapalı değilse onaylayamaz (rota_revizyonu_dort_goz adıyla bildirilir).
CREATE FUNCTION rotalar_revizyon_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rota revizyonu silinmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_silinmez', TABLE = 'rota_revizyonu';
  END IF;
  IF OLD.durum = 'iptal' THEN
    RAISE EXCEPTION 'İptal edilen revizyon değişmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_iptal_son', TABLE = 'rota_revizyonu';
  END IF;
  IF (NEW.malzeme_id, NEW.harf, NEW.kaynak_revizyon_id, NEW.acan_kisi_id, NEW.acilma)
       IS DISTINCT FROM (OLD.malzeme_id, OLD.harf, OLD.kaynak_revizyon_id, OLD.acan_kisi_id, OLD.acilma) THEN
    RAISE EXCEPTION 'Revizyonun kimlik alanları değişmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_kimlik_sabit', TABLE = 'rota_revizyonu';
  END IF;
  IF OLD.durum <> 'taslak' AND NEW.aciklama IS DISTINCT FROM OLD.aciklama THEN
    RAISE EXCEPTION 'Revizyon yalnız taslakta değişir (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_icerik_kilitli', TABLE = 'rota_revizyonu';
  END IF;
  IF NEW.durum <> OLD.durum AND NOT (
       (OLD.durum = 'taslak' AND NEW.durum IN ('onay_bekliyor', 'iptal'))
    OR (OLD.durum = 'onay_bekliyor' AND NEW.durum IN ('taslak', 'onayli', 'yururlukte'))
    OR (OLD.durum = 'onayli' AND NEW.durum = 'yururlukte')
    OR (OLD.durum = 'yururlukte' AND NEW.durum = 'onayli')) THEN
    RAISE EXCEPTION 'Revizyon durumu % durumundan % durumuna geçemez (revizyon %)', OLD.durum, NEW.durum, OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_durum_gecisi', TABLE = 'rota_revizyonu';
  END IF;
  IF NEW.onaylayan_kisi_id IS NOT NULL AND NOT NEW.dort_gozsuz_onay
     AND NEW.onaylayan_kisi_id IS DISTINCT FROM OLD.onaylayan_kisi_id
     AND EXISTS (SELECT 1 FROM rota_revizyonu_duzenleyen d WHERE d.revizyon_id = NEW.id AND d.kisi_id = NEW.onaylayan_kisi_id) THEN
    RAISE EXCEPTION 'Revizyonu düzenleyen kişi onaylayamaz (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_dort_goz', TABLE = 'rota_revizyonu';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rota_revizyonu_kilitli BEFORE UPDATE OR DELETE ON rota_revizyonu
  FOR EACH ROW EXECUTE FUNCTION rotalar_revizyon_kilitli();

CREATE FUNCTION rotalar_revizyon_bosaltilmaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Rota revizyonu silinmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_silinmez';
END $$;
CREATE TRIGGER rota_revizyonu_bosaltilmaz BEFORE TRUNCATE ON rota_revizyonu
  FOR EACH STATEMENT EXECUTE FUNCTION rotalar_revizyon_bosaltilmaz();

-- İçerik (adım, aday kaynak, bileşen, yan ürün) yalnız taslak revizyonda yazılır ve silinir; istisna yoktur.
CREATE FUNCTION rotalar_icerik_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  satir record;
  revizyon int;
  durum text;
BEGIN
  IF TG_OP = 'DELETE' THEN satir := OLD; ELSE satir := NEW; END IF;
  IF TG_TABLE_NAME = 'rota_adimi' THEN
    revizyon := satir.revizyon_id;
    IF TG_OP = 'UPDATE' AND NEW.revizyon_id <> OLD.revizyon_id THEN
      RAISE EXCEPTION 'Adım başka revizyona taşınmaz' USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_icerik_kilitli';
    END IF;
  ELSE
    SELECT a.revizyon_id INTO revizyon FROM rota_adimi a WHERE a.id = satir.adim_id;
  END IF;
  SELECT r.durum INTO durum FROM rota_revizyonu r WHERE r.id = revizyon;
  IF durum IS DISTINCT FROM 'taslak' THEN
    RAISE EXCEPTION 'Rota içeriği yalnız taslakta değişir (revizyon %, durum %)', revizyon, durum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_icerik_kilitli', TABLE = TG_TABLE_NAME;
  END IF;
  RETURN satir;
END $$;
CREATE TRIGGER rota_adimi_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_adimi
  FOR EACH ROW EXECUTE FUNCTION rotalar_icerik_kilitli();
CREATE TRIGGER rota_aday_kaynagi_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_aday_kaynagi
  FOR EACH ROW EXECUTE FUNCTION rotalar_icerik_kilitli();
CREATE TRIGGER rota_bileseni_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_bileseni
  FOR EACH ROW EXECUTE FUNCTION rotalar_icerik_kilitli();
CREATE TRIGGER rota_yan_urunu_kilitli BEFORE INSERT OR UPDATE OR DELETE ON rota_yan_urunu
  FOR EACH ROW EXECUTE FUNCTION rotalar_icerik_kilitli();
