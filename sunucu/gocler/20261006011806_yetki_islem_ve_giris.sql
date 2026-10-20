-- Yetki birimi işlemdir ve yalnız rolle verilir; kişi birden çok rol alır. Giriş kilidi yerine artan bekleme gelir.

-- Kişiye özel yetki kalkıyor: satır varsa sessizce silinmez, önce o kişilerin rolü elle düzenlenir.
DO $$
DECLARE
  sayi bigint;
BEGIN
  SELECT count(*) INTO sayi FROM kisi_sayfa_yetkisi;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'kisi_sayfa_yetkisi tablosunda % satır var; kişiye özel yetki kalkıyor. Önce bu kişilerin yetkisini rolle verin ve satırları silin, sonra göçü yeniden çalıştırın.', sayi;
  END IF;
END $$;

DROP TABLE kisi_sayfa_yetkisi;
DROP TABLE rol_sayfa_yetkisi;
DROP TABLE rol_yetenegi;

-- rol.yonetici "bütün işlemler" demektir: bayraklı role satır yazılmaz, yeni işlem kendiliğinden onundur.
CREATE TABLE rol_islemi (
  rol_id int NOT NULL REFERENCES rol ON DELETE CASCADE,
  islem text NOT NULL CONSTRAINT rol_islemi_bicim CHECK (islem ~ '^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$'),
  PRIMARY KEY (rol_id, islem)
);

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, m.islem
  FROM rol r
  JOIN (VALUES
    ('planlamaci', 'kisiler.oku'),
    ('planlamaci', 'sayfa.terminal'),
    ('planlamaci', 'sayfa.kuyruk'),
    ('planlamaci', 'sayfa.uretim-emirleri'),
    ('planlamaci', 'sayfa.cizelge'),
    ('planlamaci', 'sayfa.matris'),
    ('planlamaci', 'sayfa.vardiya'),
    ('planlamaci', 'sayfa.mesai'),
    ('planlamaci', 'sayfa.stok'),
    ('planlamaci', 'sayfa.rota'),
    ('planlamaci', 'sayfa.istasyonlar'),
    ('operator', 'sayfa.terminal'),
    ('operator', 'sayfa.kuyruk')
  ) AS m (kod, islem) ON m.kod = r.kod;

CREATE TABLE kisi_rolu (
  kisi_id int NOT NULL REFERENCES kisi ON DELETE CASCADE,
  rol_id int NOT NULL REFERENCES rol,
  PRIMARY KEY (kisi_id, rol_id)
);
CREATE INDEX kisi_rolu_rol ON kisi_rolu (rol_id);

INSERT INTO kisi_rolu (kisi_id, rol_id) SELECT id, rol_id FROM kisi WHERE rol_id IS NOT NULL;

ALTER TABLE kisi DROP CONSTRAINT kisi_giris_rol_ister;
ALTER TABLE kisi DROP COLUMN rol_id;

-- "Girişi olan kişinin en az bir rolü olur" kuralı iki tabloya yayıldı; CHECK başka tabloya bakamaz.
-- Denetim transaction sonundadır: kişi ve rolü aynı transaction'da herhangi bir sırayla yazılabilir.
-- Kişi satırı kilitlenir ki son iki rolü aynı anda silen iki transaction birbirini görsün.
CREATE FUNCTION kisi_giris_rol_denetle(hedef int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM kisi WHERE id = hedef AND kullanici_adi IS NOT NULL FOR UPDATE;
  IF FOUND AND NOT EXISTS (SELECT 1 FROM kisi_rolu WHERE kisi_id = hedef) THEN
    RAISE EXCEPTION 'girişi olan kişinin en az bir rolü olmalı (kisi_giris_rol_ister)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'kisi_giris_rol_ister', TABLE = 'kisi';
  END IF;
END $$;

CREATE FUNCTION kisi_giris_rol_kisiden() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM kisi_giris_rol_denetle(NEW.id);
  RETURN NULL;
END $$;

CREATE FUNCTION kisi_giris_rol_roldan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM kisi_giris_rol_denetle(OLD.kisi_id);
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER kisi_giris_rol_ister AFTER INSERT OR UPDATE OF kullanici_adi ON kisi
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kisi_giris_rol_kisiden();
CREATE CONSTRAINT TRIGGER kisi_rolu_giris_rol_ister AFTER DELETE OR UPDATE ON kisi_rolu
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kisi_giris_rol_roldan();

-- Satır tetikleyicisi TRUNCATE'te çalışmaz; boşaltma bütün girişli kişileri rolsüz bırakırdı.
CREATE FUNCTION kisi_rolu_bosaltilmaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'kisi_rolu boşaltılamaz: girişi olan kişinin en az bir rolü olmalı (kisi_giris_rol_ister)'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'kisi_giris_rol_ister', TABLE = 'kisi_rolu';
END $$;

CREATE TRIGGER kisi_rolu_bosaltilmaz BEFORE TRUNCATE ON kisi_rolu
  FOR EACH STATEMENT EXECUTE FUNCTION kisi_rolu_bosaltilmaz();

-- Deneme kaydı artık defter değil: 30 günden eskisi silinir.
DROP TRIGGER giris_denemesi_degismez ON giris_denemesi;
DROP TRIGGER giris_denemesi_bosaltilmaz ON giris_denemesi;

-- Kilit yok; bekleme süresi dolmadan gelen deneme parolaya bakılmadan reddedilir ve 'beklemede' yazılır.
ALTER TABLE giris_denemesi DROP CONSTRAINT giris_denemesi_sonuc_check;
UPDATE giris_denemesi SET sonuc = 'beklemede' WHERE sonuc = 'kilitli';
ALTER TABLE giris_denemesi
  ADD CONSTRAINT giris_denemesi_sonuc_gecerli CHECK (sonuc IN ('basarili', 'hatali', 'beklemede'));

-- Bekleme kullanıcı adı ve cihaz (IP) çiftine göre sayılır.
DROP INDEX giris_denemesi_ad_zaman;
CREATE INDEX giris_denemesi_ad_ip_zaman ON giris_denemesi (kullanici_adi, ip, zaman DESC);
-- Eski kayıt temizliği her giriş denemesinde koşar; zamana göre bulur, tabloyu taramaz.
CREATE INDEX giris_denemesi_zaman ON giris_denemesi (zaman);
