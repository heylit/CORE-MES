-- 3199 (A + D): aparat ve özel takım planın ikincil kaynağıdır. Kapasite satırı türünü, plandaki kısıt biçimini (sert: plan bekletir, izle:
-- yalnız uyarır) ve özel takımda ömrü taşır; kesinti takvimi (bakım, kalibrasyon, ödünç) o saatlerde adedi düşürür. Yalnız ekleyen göç:
-- var olan satırlar sert kısıtlı aparat olur, ömür boştur (sayılmaz).
ALTER TABLE istasyonlar_aparat_kapasitesi
  ADD COLUMN tur text NOT NULL DEFAULT 'aparat' CONSTRAINT istasyonlar_aparat_kapasitesi_tur CHECK (tur IN ('aparat', 'ozel_takim')),
  ADD COLUMN kisit text NOT NULL DEFAULT 'sert' CONSTRAINT istasyonlar_aparat_kapasitesi_kisit CHECK (kisit IN ('sert', 'izle')),
  ADD COLUMN omur numeric(12, 2) CONSTRAINT istasyonlar_aparat_kapasitesi_omur CHECK (omur IS NULL OR (omur > 0 AND omur <= 1000000)),
  ADD COLUMN omur_birimi text CONSTRAINT istasyonlar_aparat_kapasitesi_omur_birimi CHECK (omur_birimi IS NULL OR omur_birimi IN ('dk', 'adet')),
  ADD COLUMN degisim_dk int CONSTRAINT istasyonlar_aparat_kapasitesi_degisim_dk CHECK (degisim_dk IS NULL OR degisim_dk BETWEEN 0 AND 1440),
  ADD CONSTRAINT istasyonlar_aparat_kapasitesi_omur_birimli CHECK ((omur IS NULL) = (omur_birimi IS NULL)),
  -- Ömür yalnız özel takımda sayılır (V15: dakika ya da adet, ikisi birden değil).
  ADD CONSTRAINT istasyonlar_aparat_kapasitesi_omur_takimda CHECK (omur IS NULL OR tur = 'ozel_takim');

-- Kesinti kapasite satırının parçasıdır: satırla birlikte yazılır ve silinir; adet o aralıkta planın kullanabileceği adetten düşer (0'a kadar).
CREATE TABLE istasyonlar_aparat_kesintisi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT istasyonlar_aparat_kesintisi_pk PRIMARY KEY,
  kapasite_id int NOT NULL CONSTRAINT istasyonlar_aparat_kesintisi_kapasite_fk REFERENCES istasyonlar_aparat_kapasitesi ON DELETE CASCADE,
  neden text NOT NULL CONSTRAINT istasyonlar_aparat_kesintisi_neden CHECK (neden IN ('bakim', 'kalibrasyon', 'odunc')),
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  adet int NOT NULL CONSTRAINT istasyonlar_aparat_kesintisi_adet CHECK (adet BETWEEN 1 AND 10000),
  aciklama text CONSTRAINT istasyonlar_aparat_kesintisi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 200)),
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_aparat_kesintisi_degistiren_fk REFERENCES kisi,
  degisme timestamptz NOT NULL DEFAULT now(),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT istasyonlar_aparat_kesintisi_aralik CHECK (bitis > baslangic)
);
CREATE INDEX istasyonlar_aparat_kesintisi_kapasite_fk_idx ON istasyonlar_aparat_kesintisi (kapasite_id);

-- 1968 a: planın kapasite girdileri değişiklik defterine düşer.
CREATE TRIGGER istasyonlar_aparat_kesintisi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyonlar_aparat_kesintisi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'degistiren_kisi_id', 'degisme');
