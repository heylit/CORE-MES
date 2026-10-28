-- Onaylı kapanış (1072 a, 1073 a, 1076 a, 1077 b, 1079 a, 1080 a): emir son adımda "bitti" olur; kapanış onun üstünde ayrı kayıttır.
-- Maddeler canlı okunur, tabloda tutulmaz; tabloda yalnız onaylar, muafiyetler ve defter durur. Yeni ve boş tablolar; dolu tabloya dokunulmaz.
CREATE TABLE uretim_emirleri_kapanis (
  uretim_emri_id int PRIMARY KEY REFERENCES uretim_emri,
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT uretim_emirleri_kapanis_durum_degeri CHECK (durum IN ('acik', 'tamam')),
  -- Göçten önce bitmiş emir onaysız tamam sayılır (1072 a varsayımı); geri açılınca eski olmaktan çıkar.
  eski boolean NOT NULL DEFAULT false,
  -- Geri açma (1080 a) yeni turu başlatır; muafiyetler tura bağlıdır.
  tur int NOT NULL DEFAULT 1 CONSTRAINT uretim_emirleri_kapanis_tur_pozitif CHECK (tur >= 1),
  kalite_kisi_id int REFERENCES kisi,
  kalite_zamani timestamptz,
  mudur_kisi_id int REFERENCES kisi,
  mudur_zamani timestamptz,
  acilis timestamptz NOT NULL DEFAULT now(),
  tamamlanma timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT uretim_emirleri_kapanis_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT uretim_emirleri_kapanis_kalite_alanlari CHECK ((kalite_kisi_id IS NULL) = (kalite_zamani IS NULL)),
  CONSTRAINT uretim_emirleri_kapanis_mudur_alanlari CHECK ((mudur_kisi_id IS NULL) = (mudur_zamani IS NULL)),
  -- Tamam: iki onay verilmiş ya da göç öncesi; açık: tamamlanma boş ve eski değil.
  CONSTRAINT uretim_emirleri_kapanis_tamam_kosulu CHECK (
    (durum = 'tamam' AND tamamlanma IS NOT NULL AND (eski OR (kalite_kisi_id IS NOT NULL AND mudur_kisi_id IS NOT NULL)))
    OR (durum = 'acik' AND tamamlanma IS NULL AND NOT eski)
  )
);
CREATE INDEX uretim_emirleri_kapanis_acik_idx ON uretim_emirleri_kapanis (acilis) WHERE durum = 'acik';
CREATE INDEX uretim_emirleri_kapanis_tamam_idx ON uretim_emirleri_kapanis (tamamlanma) WHERE durum = 'tamam';
CREATE INDEX uretim_emirleri_kapanis_kalite_kisi_idx ON uretim_emirleri_kapanis (kalite_kisi_id);
CREATE INDEX uretim_emirleri_kapanis_mudur_kisi_idx ON uretim_emirleri_kapanis (mudur_kisi_id);

-- 1076 a: eksik maddeyi yalnız müdür gerekçeyle muaf tutar; aynı turda madde başına bir kez, silinmez.
CREATE TABLE uretim_emirleri_kapanis_muafiyeti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emirleri_kapanis,
  tur int NOT NULL CONSTRAINT uretim_emirleri_kapanis_muafiyeti_tur_pozitif CHECK (tur >= 1),
  madde text NOT NULL CONSTRAINT uretim_emirleri_kapanis_muafiyeti_madde CHECK (
    madde IN ('is-emirleri', 'ilk-parca', 'hatali', 'olcum', 'izlenebilirlik', 'fason', 'stok', 'sevkiyat', 'ncr')),
  kisi_id int NOT NULL REFERENCES kisi,
  gerekce text NOT NULL CONSTRAINT uretim_emirleri_kapanis_muafiyeti_gerekce CHECK (btrim(gerekce) <> '' AND char_length(gerekce) <= 500),
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_kapanis_muafiyeti_tek UNIQUE (uretim_emri_id, tur, madde)
);
CREATE INDEX uretim_emirleri_kapanis_muafiyeti_kisi_idx ON uretim_emirleri_kapanis_muafiyeti (kisi_id);
CREATE TRIGGER uretim_emirleri_kapanis_muafiyeti_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_kapanis_muafiyeti
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_kapanis_muafiyeti_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_kapanis_muafiyeti
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Kapanış defteri: kim, ne zaman, hangi gerekçeyle; yalnız ekleme.
CREATE TABLE uretim_emirleri_kapanis_defteri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL REFERENCES uretim_emirleri_kapanis,
  olay text NOT NULL CONSTRAINT uretim_emirleri_kapanis_defteri_olay CHECK (
    olay IN ('kalite_onay', 'mudur_onay', 'kalite_ret', 'mudur_ret', 'muaf', 'tamamlandi', 'geri_acildi')),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  gerekce text CONSTRAINT uretim_emirleri_kapanis_defteri_gerekce CHECK (gerekce IS NULL OR (btrim(gerekce) <> '' AND char_length(gerekce) <= 500)),
  madde text CONSTRAINT uretim_emirleri_kapanis_defteri_madde CHECK (
    madde IS NULL OR madde IN ('is-emirleri', 'ilk-parca', 'hatali', 'olcum', 'izlenebilirlik', 'fason', 'stok', 'sevkiyat', 'ncr')),
  CONSTRAINT uretim_emirleri_kapanis_defteri_gerekceli CHECK (olay NOT IN ('kalite_ret', 'mudur_ret', 'muaf', 'geri_acildi') OR gerekce IS NOT NULL),
  CONSTRAINT uretim_emirleri_kapanis_defteri_maddeli CHECK ((olay = 'muaf') = (madde IS NOT NULL))
);
CREATE INDEX uretim_emirleri_kapanis_defteri_emir_idx ON uretim_emirleri_kapanis_defteri (uretim_emri_id);
CREATE INDEX uretim_emirleri_kapanis_defteri_kisi_idx ON uretim_emirleri_kapanis_defteri (kisi_id);
CREATE TRIGGER uretim_emirleri_kapanis_defteri_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_kapanis_defteri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_kapanis_defteri_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_kapanis_defteri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Bugüne kadar bitmiş iş emirli emirler onay kuyruğuna düşmez (1072 a varsayımı); bitiş zamanı tamamlanma sayılır.
INSERT INTO uretim_emirleri_kapanis (uretim_emri_id, durum, eski, acilis, tamamlanma)
SELECT id, 'tamam', true, COALESCE(bitis, now()), COALESCE(bitis, now())
  FROM uretim_emri WHERE durum = 'bitti' AND malzeme_no IS NOT NULL;
