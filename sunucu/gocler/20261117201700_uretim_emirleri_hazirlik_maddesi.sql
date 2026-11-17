-- 3396 a: hazırlık maddesi listesi koddan veriye iner (ad, kısa ad, sıra, açık/kapalı) ve özel madde eklenir. Sistem maddesinin hâlini
-- yine sahibi modülün çözücüsü verir; özel maddenin hâlini hazırlık görevi verir (yalnız uyarır). Durduran üç madde kapatılamaz,
-- uyarana çevrilemez, silinemez (120-122 a, Risk K1); durduran/uyaran ayrımı kod listesiyle aynıdır (2146-1 a).
CREATE TABLE uretim_emirleri_hazirlik_maddesi (
  kod text PRIMARY KEY CONSTRAINT uretim_emirleri_hazirlik_maddesi_kod CHECK (kod ~ '^[a-z][a-z0-9-]{1,39}$'),
  ad text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_maddesi_ad CHECK (btrim(ad) <> '' AND length(ad) <= 60),
  kisa text NOT NULL CONSTRAINT uretim_emirleri_hazirlik_maddesi_kisa CHECK (btrim(kisa) <> '' AND length(kisa) <= 20),
  sira int NOT NULL CONSTRAINT uretim_emirleri_hazirlik_maddesi_sira CHECK (sira BETWEEN 1 AND 999),
  acik boolean NOT NULL DEFAULT true,
  sistem boolean NOT NULL DEFAULT false,
  durduran boolean NOT NULL DEFAULT false,
  olusturan_id int CONSTRAINT uretim_emirleri_hazirlik_maddesi_olusturan REFERENCES kisi (id),
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1,
  degistiren_id int CONSTRAINT uretim_emirleri_hazirlik_maddesi_degistiren REFERENCES kisi (id),
  degisti timestamptz,
  CONSTRAINT uretim_emirleri_hazirlik_maddesi_sistem
    CHECK (sistem = (kod IN ('cnc', 'cizim', 'yayin', 'rota', 'malzeme', 'takim-omru', 'takim-hazirla', 'makine', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti'))),
  CONSTRAINT uretim_emirleri_hazirlik_maddesi_ozel_kod CHECK (sistem OR kod ~ '^ozel-[a-z]{1,8}$'),
  CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran CHECK (durduran = (kod IN ('cnc', 'cizim', 'yayin'))),
  CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran_kilit CHECK (NOT durduran OR acik)
);

-- Satır silinmez, kapatılır: şablon kalemi ve görev maddeye kodla bağlıdır. Yeni sistem maddesi göçle eklenir.
CREATE FUNCTION uretim_emirleri_hazirlik_maddesi_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'uretim_emirleri_hazirlik_maddesi_silinmez',
    MESSAGE = 'Hazırlık maddesi silinmez; kapatılır.';
END $$;
CREATE TRIGGER uretim_emirleri_hazirlik_maddesi_silinmez BEFORE DELETE ON uretim_emirleri_hazirlik_maddesi
  FOR EACH ROW EXECUTE FUNCTION uretim_emirleri_hazirlik_maddesi_silinmez();
CREATE TRIGGER uretim_emirleri_hazirlik_maddesi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_hazirlik_maddesi
  FOR EACH STATEMENT EXECUTE FUNCTION uretim_emirleri_hazirlik_maddesi_silinmez();

-- Sıra bugünkü ekran sırasıdır.
INSERT INTO uretim_emirleri_hazirlik_maddesi (kod, ad, kisa, sira, sistem, durduran) VALUES
  ('cnc', 'CNC kurulumu', 'CNC', 10, true, true),
  ('cizim', 'Çizim revizyonu', 'Çizim', 20, true, true),
  ('yayin', 'Terminale gönderildi', 'Terminal', 30, true, true),
  ('rota', 'Rota yürürlükte', 'Rota', 40, true, false),
  ('malzeme', 'Malzeme (girdi stoğu)', 'Malzeme', 50, true, false),
  ('takim-omru', 'Takım ömrü', 'Takım', 60, true, false),
  ('takim-hazirla', 'Takım hazırla', 'Takım hazırla', 70, true, false),
  ('makine', 'Makine durumu', 'Makine', 80, true, false),
  ('talimat', 'Hazırlık talimatı', 'Talimat', 90, true, false),
  ('ek-madde', 'Ek hazırlık maddesi', 'Ek madde', 100, true, false),
  ('aparat', 'Aparat', 'Aparat', 110, true, false),
  ('olcu-aleti', 'Ölçü aleti (kalibrasyon)', 'Ölçü', 120, true, false);

-- Özel madde kodu harflidir (ozel-a, ozel-b, ...): proje şablon kalemi kodu yalnız harf ve tire kabul eder.
CREATE SEQUENCE uretim_emirleri_hazirlik_ozel_no;
