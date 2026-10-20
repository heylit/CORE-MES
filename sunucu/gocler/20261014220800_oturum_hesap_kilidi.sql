-- Bir kullanıcı adına bütün cihazlardan art arda 10 hatalı deneme adı 15 dakika kilitler (kullanıcı kararı, 14.10.2026).
-- Ad yabancı anahtar değildir: olmayan ad da kilitlenir, kilit hesabın varlığını ele vermez.
CREATE TABLE oturum_hesap_kilidi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kullanici_adi text NOT NULL,
  kilitlendi timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  acildi timestamptz,
  acan_kisi_id int CONSTRAINT oturum_hesap_kilidi_acan_fk REFERENCES kisi,
  CONSTRAINT oturum_hesap_kilidi_sure_gecerli CHECK (bitis > kilitlendi),
  CONSTRAINT oturum_hesap_kilidi_acilis_butun CHECK ((acildi IS NULL) = (acan_kisi_id IS NULL))
);
-- Her parolaya bakılan denemede adın son kilidi aranır.
CREATE INDEX oturum_hesap_kilidi_ad ON oturum_hesap_kilidi (kullanici_adi, kilitlendi DESC);

-- Kilit güvenlik kanıtıdır: silinmez, boşaltılmaz; yalnız bir kez, kimin açtığıyla açılır. Başka sütun değişmez.
CREATE FUNCTION oturum_hesap_kilidi_yalniz_acilir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.acildi IS NULL AND NEW.acildi IS NOT NULL
     AND NEW.id = OLD.id AND NEW.kullanici_adi = OLD.kullanici_adi
     AND NEW.kilitlendi = OLD.kilitlendi AND NEW.bitis = OLD.bitis THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% tablosunda kilit yalnız bir kez açılır, başka sütun değişmez', TG_TABLE_NAME;
END $$;

CREATE TRIGGER oturum_hesap_kilidi_yalniz_acilir BEFORE UPDATE ON oturum_hesap_kilidi
  FOR EACH ROW EXECUTE FUNCTION oturum_hesap_kilidi_yalniz_acilir();
CREATE TRIGGER oturum_hesap_kilidi_silinmez BEFORE DELETE ON oturum_hesap_kilidi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER oturum_hesap_kilidi_bosaltilmaz BEFORE TRUNCATE ON oturum_hesap_kilidi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
