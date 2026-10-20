-- Nizamiye 289 b: kart okuyucu hareketi oturumsuz uçtan doğrudan gönderir (ADR 0016). Dosya aktarımının tabloları değişmez; cihazın kaydı,
-- gönderimi, ham gövdesi ve hareketi ayrı tablolardadır (dolu tabloya boş olabilen sütun eklenmez, kapsam 289 b).
CREATE TABLE nizamiye_pdks_cihaz (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT nizamiye_pdks_cihaz_ad_uzunluk CHECK (length(btrim(ad)) BETWEEN 1 AND 100),
  -- Cihaz kayıtlı adresinden tanınır; iki cihaz aynı adresi paylaşamaz.
  ip inet NOT NULL CONSTRAINT nizamiye_pdks_cihaz_ip_tek UNIQUE CONSTRAINT nizamiye_pdks_cihaz_ip_tek_adres CHECK (masklen(ip) = CASE family(ip) WHEN 4 THEN 32 ELSE 128 END),
  -- Anahtarın kendisi saklanmaz; scrypt özeti (tuz ve özet) saklanır.
  anahtar_ozeti text NOT NULL CONSTRAINT nizamiye_pdks_cihaz_anahtar_bicim CHECK (anahtar_ozeti ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$'),
  aktif boolean NOT NULL DEFAULT true,
  olusturan_kisi_id int NOT NULL REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1
);

-- Kimliği doğrulanmış her gönderim bir satırdır (yeni hareket sayısı cihaz hareketinden sayılır); kimliği doğrulanamayan istek yazılmaz (yalnız sayılır), tablo dışarıdan şişirilemez.
CREATE TABLE nizamiye_pdks_gonderim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_id int NOT NULL REFERENCES nizamiye_pdks_cihaz,
  ip inet NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  satir_sayisi int NOT NULL CONSTRAINT nizamiye_pdks_gonderim_satir_negatif_degil CHECK (satir_sayisi >= 0),
  eslesmeyen int NOT NULL CONSTRAINT nizamiye_pdks_gonderim_eslesmeyen_negatif_degil CHECK (eslesmeyen >= 0),
  hatali int NOT NULL CONSTRAINT nizamiye_pdks_gonderim_hatali_negatif_degil CHECK (hatali >= 0)
);
CREATE INDEX nizamiye_pdks_gonderim_cihaz_zaman ON nizamiye_pdks_gonderim (cihaz_id, zaman DESC, id DESC);

-- Ham gövde ayrıştırıcı düzelince yeniden işlenebilsin diye saklanır; saklama süresi dolunca yalnız bu satır silinir, gönderim kalır.
CREATE TABLE nizamiye_pdks_gonderim_ham (
  gonderim_id int PRIMARY KEY REFERENCES nizamiye_pdks_gonderim,
  govde text NOT NULL CONSTRAINT nizamiye_pdks_gonderim_ham_uzunluk CHECK (length(govde) <= 400000)
);

-- Ham gövde değişmez; en az 30 günlük satır silinemez (saklama süresi ortam değişkeninde, alt sınırı burada da durur).
CREATE FUNCTION nizamiye_pdks_ham_korunur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (SELECT zaman FROM nizamiye_pdks_gonderim WHERE id = OLD.gonderim_id) < now() - interval '30 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% tablosunda yalnız 30 günden eski satır silinir', TG_TABLE_NAME;
END $$;

CREATE TABLE nizamiye_pdks_cihaz_hareket (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL,
  yon text NOT NULL CONSTRAINT nizamiye_pdks_cihaz_hareket_yon_secenek CHECK (yon IN ('giris', 'cikis')),
  gonderim_id int NOT NULL REFERENCES nizamiye_pdks_gonderim,
  CONSTRAINT nizamiye_pdks_cihaz_hareket_tek UNIQUE (kisi_id, zaman, yon)
);
-- Acil durum listesi her kişinin son hareketini iki tablodan zamana göre arar.
CREATE INDEX nizamiye_pdks_cihaz_hareket_kisi_zaman ON nizamiye_pdks_cihaz_hareket (kisi_id, zaman DESC, id DESC);

CREATE TRIGGER nizamiye_pdks_gonderim_degismez BEFORE UPDATE OR DELETE ON nizamiye_pdks_gonderim
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_gonderim_bosaltilmaz BEFORE TRUNCATE ON nizamiye_pdks_gonderim
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_gonderim_ham_korunur BEFORE UPDATE OR DELETE ON nizamiye_pdks_gonderim_ham
  FOR EACH ROW EXECUTE FUNCTION nizamiye_pdks_ham_korunur();
CREATE TRIGGER nizamiye_pdks_gonderim_ham_bosaltilmaz BEFORE TRUNCATE ON nizamiye_pdks_gonderim_ham
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_cihaz_hareket_degismez BEFORE UPDATE OR DELETE ON nizamiye_pdks_cihaz_hareket
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER nizamiye_pdks_cihaz_hareket_bosaltilmaz BEFORE TRUNCATE ON nizamiye_pdks_cihaz_hareket
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
