-- Plan yalnız yerleştirir (P1): iş emri (uretim-emirleri) bir makineye ya da bir kişiye (K3) ve zamana yerleşir. Emir ve adımları
-- uretim-emirleri'ndedir; plan onları okur, kopyalamaz. İş emri tablosu gelince is_emri_id yabancı anahtarı eklenir (UYUM-BORCU).

-- Canlı planın sürümü: her canlı yazma artırır. Senaryo açıldığı sürümü saklar; canlıya almada fark çakışmadır (P4).
CREATE TABLE plan_durumu (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT plan_durumu_tek CHECK (tek),
  surum int NOT NULL DEFAULT 1 CONSTRAINT plan_durumu_surum CHECK (surum > 0)
);
INSERT INTO plan_durumu DEFAULT VALUES;

CREATE TABLE plan_yerlesimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL CONSTRAINT plan_yerlesimi_is_emri_tekil UNIQUE,
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  sira int NOT NULL DEFAULT 1,
  kilitli boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1,
  yazan_kisi_id int NOT NULL REFERENCES kisi,
  yazma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_yerlesimi_tek_kaynak CHECK ((makine_id IS NULL) <> (kisi_id IS NULL)),
  CONSTRAINT plan_yerlesimi_zaman CHECK (bitis > baslangic)
);
CREATE INDEX plan_yerlesimi_makine_idx ON plan_yerlesimi (makine_id, baslangic) WHERE makine_id IS NOT NULL;
CREATE INDEX plan_yerlesimi_kisi_idx ON plan_yerlesimi (kisi_id, baslangic) WHERE kisi_id IS NOT NULL;

-- Stüdyo (P4): senaryo canlı yerleşimlerin kopyasıdır; senaryoda yapılan canlıyı değiştirmez. Senaryo silinmez.
CREATE TABLE plan_senaryosu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT plan_senaryosu_ad CHECK (btrim(ad) <> '' AND char_length(ad) <= 80),
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT plan_senaryosu_durum CHECK (durum IN ('acik', 'canliya_alindi', 'vazgecildi')),
  taban_plan_surumu int NOT NULL,
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  kapatan_kisi_id int REFERENCES kisi,
  kapanma timestamptz,
  CONSTRAINT plan_senaryosu_kapanis CHECK ((durum = 'acik') = (kapanma IS NULL) AND (kapanma IS NULL) = (kapatan_kisi_id IS NULL))
);

CREATE TABLE plan_senaryo_yerlesimi (
  senaryo_id int NOT NULL REFERENCES plan_senaryosu,
  is_emri_id int NOT NULL,
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  kilitli boolean NOT NULL DEFAULT false,
  PRIMARY KEY (senaryo_id, is_emri_id),
  CONSTRAINT plan_senaryo_yerlesimi_tek_kaynak CHECK ((makine_id IS NULL) <> (kisi_id IS NULL)),
  CONSTRAINT plan_senaryo_yerlesimi_zaman CHECK (bitis > baslangic)
);
