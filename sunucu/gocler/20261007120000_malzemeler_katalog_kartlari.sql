-- Malzeme Kataloğu (prototip) kartları TMI'de. KULLANICI KARARI (07.10.2026): kart bütün olarak tek JSON sütununda
-- tutulur ("serbest json yok" kuralına bilinçli istisna); denetlenebilen her alan ayrı sütunda ve kısıtla korunur.
-- Var olan malzeme tablolarına dokunulmaz.

-- Stok kodunun sıra kısmı önek başına artar; satır kilidiyle eşzamanlı iki kart aynı numarayı alamaz.
CREATE TABLE malzeme_katalog_kod_sirasi (
  onek text PRIMARY KEY CONSTRAINT malzeme_katalog_kod_sirasi_onek_bicimi CHECK (onek ~ '^[A-Z0-9]+(-[A-Z0-9]+)*-$' AND length(onek) <= 30),
  son_sira int NOT NULL DEFAULT 0 CONSTRAINT malzeme_katalog_kod_sirasi_pozitif CHECK (son_sira >= 0)
);

CREATE TABLE malzeme_katalog_karti (
  kimlik text PRIMARY KEY CONSTRAINT malzeme_katalog_karti_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,64}$'),
  tur text NOT NULL CONSTRAINT malzeme_katalog_karti_tur CHECK (tur IN ('hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas')),
  onek text NOT NULL REFERENCES malzeme_katalog_kod_sirasi,
  sira_no int NOT NULL CONSTRAINT malzeme_katalog_karti_sira_pozitif CHECK (sira_no > 0),
  -- Eşik üstünde kesilmez (üretim emri numarasıyla aynı kalıp).
  stok_kodu text GENERATED ALWAYS AS (onek || CASE WHEN sira_no < 100000 THEN lpad(sira_no::text, 5, '0') ELSE sira_no::text END) STORED,
  benzersiz_anahtar text CONSTRAINT malzeme_katalog_karti_anahtar_dolu CHECK (benzersiz_anahtar IS NULL OR btrim(benzersiz_anahtar) <> ''),
  mukerrer_gerekcesi text CONSTRAINT malzeme_katalog_karti_gerekce_dolu CHECK (mukerrer_gerekcesi IS NULL OR btrim(mukerrer_gerekcesi) <> ''),
  onay_durumu text NOT NULL CONSTRAINT malzeme_katalog_karti_onay CHECK (onay_durumu IN ('taslak', 'onayda', 'aktif', 'pasif', 'iptal')),
  kayit jsonb NOT NULL CONSTRAINT malzeme_katalog_karti_kayit_nesne CHECK (jsonb_typeof(kayit) = 'object'),
  surum int NOT NULL DEFAULT 1 CONSTRAINT malzeme_katalog_karti_surum_pozitif CHECK (surum > 0),
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  gonderen_kisi_id int REFERENCES kisi,
  onaylayan_kisi_id int REFERENCES kisi,
  onaylama timestamptz,
  -- Dört göz ayarı kapalıyken verilen onay işaretlenir; kısıt yalnız işaretsiz onayda aranır.
  dort_gozsuz_onay boolean NOT NULL DEFAULT false,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT malzeme_katalog_karti_stok_kodu_tek UNIQUE (stok_kodu),
  CONSTRAINT malzeme_katalog_karti_onek_sira_tek UNIQUE (onek, sira_no),
  CONSTRAINT malzeme_katalog_karti_dort_goz CHECK (dort_gozsuz_onay OR onaylayan_kisi_id IS NULL OR gonderen_kisi_id IS NULL OR onaylayan_kisi_id <> gonderen_kisi_id)
);
-- Aynı malzemenin ikinci kartı: kullanımdaki kartlarda gerekçesiz ikinci anahtar olamaz.
CREATE UNIQUE INDEX malzeme_katalog_karti_anahtar_tek ON malzeme_katalog_karti (benzersiz_anahtar)
  WHERE benzersiz_anahtar IS NOT NULL AND mukerrer_gerekcesi IS NULL AND onay_durumu IN ('taslak', 'onayda', 'aktif');
CREATE INDEX malzeme_katalog_karti_liste ON malzeme_katalog_karti (guncelleme DESC) WHERE onay_durumu <> 'iptal';

-- Kart silinmez (vazgeçilen taslak iptal edilir); stok kodu ve tür verildikten sonra değişmez.
CREATE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Malzeme kataloğu kartı silinmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_silinmez';
  END IF;
  IF (NEW.onek, NEW.sira_no, NEW.tur, NEW.acan_kisi_id) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur, OLD.acan_kisi_id) THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER malzeme_katalog_karti_koru BEFORE UPDATE OR DELETE ON malzeme_katalog_karti
  FOR EACH ROW EXECUTE FUNCTION malzeme_katalog_karti_koru();
CREATE TRIGGER malzeme_katalog_karti_bosaltilmaz BEFORE TRUNCATE ON malzeme_katalog_karti
  FOR EACH STATEMENT EXECUTE FUNCTION malzeme_katalog_karti_koru();

-- Şablonlar: kaldırılan şablon pasif olur.
CREATE TABLE malzeme_katalog_sablonu (
  kimlik text PRIMARY KEY CONSTRAINT malzeme_katalog_sablonu_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,64}$'),
  sablon jsonb NOT NULL CONSTRAINT malzeme_katalog_sablonu_nesne CHECK (jsonb_typeof(sablon) = 'object'),
  aktif boolean NOT NULL DEFAULT true,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX malzeme_katalog_sablonu_aktif ON malzeme_katalog_sablonu (guncelleme DESC) WHERE aktif;

-- Prototipin üç ayar kümesi; her biri tek satır.
CREATE TABLE malzeme_katalog_ayari (
  anahtar text PRIMARY KEY CONSTRAINT malzeme_katalog_ayari_anahtar CHECK (anahtar IN ('malzeme', 'operasyonlar', 'genel')),
  deger jsonb NOT NULL CONSTRAINT malzeme_katalog_ayari_nesne CHECK (jsonb_typeof(deger) = 'object'),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
