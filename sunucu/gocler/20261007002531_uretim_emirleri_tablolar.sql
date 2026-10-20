-- Üretim emri ve onun yalnız eklenen olay defteri. Emir silinmez (durumu iptale çevrilir); defter hiç değişmez.
-- Emir no kimlikten türer: sunucu üretir, eşzamanlı açışta çakışmaz, kimlikle birebir eşleşir.
-- lpad uzun metni keser; altı haneyi aşan kimlik bu yüzden olduğu gibi yazılır.
CREATE TABLE uretim_emri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_no text GENERATED ALWAYS AS ('UE-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  parca_no text NOT NULL CONSTRAINT uretim_emri_parca_no_bicimi CHECK (btrim(parca_no) <> '' AND length(parca_no) <= 60),
  parca_ad text NOT NULL CONSTRAINT uretim_emri_parca_ad_bicimi CHECK (btrim(parca_ad) <> '' AND length(parca_ad) <= 120),
  adet int NOT NULL CONSTRAINT uretim_emri_adet_pozitif CHECK (adet > 0),
  istasyon_id int NOT NULL REFERENCES istasyon,
  durum text NOT NULL DEFAULT 'planli' CONSTRAINT uretim_emri_durum_degeri CHECK (durum IN ('planli', 'basladi', 'bitti', 'iptal')),
  acan_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  baslama timestamptz,
  bitis timestamptz,
  iptal timestamptz,
  saglam_adet int CONSTRAINT uretim_emri_saglam_adet_eksi_degil CHECK (saglam_adet >= 0),
  CONSTRAINT uretim_emri_no_benzersiz UNIQUE (emir_no),
  -- Durum ile zaman ve adet alanları birlikte tutarlıdır: yarım geçiş yazılamaz.
  CONSTRAINT uretim_emri_durum_alanlari CHECK (
    CASE durum
      WHEN 'planli' THEN baslama IS NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'basladi' THEN baslama IS NOT NULL AND bitis IS NULL AND iptal IS NULL AND saglam_adet IS NULL
      WHEN 'bitti' THEN baslama IS NOT NULL AND bitis IS NOT NULL AND iptal IS NULL AND saglam_adet IS NOT NULL
      ELSE baslama IS NULL AND bitis IS NULL AND iptal IS NOT NULL AND saglam_adet IS NULL
    END
  )
);
CREATE INDEX uretim_emri_istasyon_durum_idx ON uretim_emri (istasyon_id, durum);
-- Bir istasyonda aynı anda tek başlamış iş: yarışta ikinci başlatma bu dizine takılır.
CREATE UNIQUE INDEX uretim_emri_istasyonda_tek_basladi ON uretim_emri (istasyon_id) WHERE durum = 'basladi';

CREATE TABLE uretim_kaydi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL REFERENCES istasyon,
  olay text NOT NULL CONSTRAINT uretim_kaydi_olay_degeri CHECK (olay IN ('baslat', 'bitir')),
  saglam_adet int CONSTRAINT uretim_kaydi_saglam_adet_eksi_degil CHECK (saglam_adet >= 0),
  zaman timestamptz NOT NULL DEFAULT now(),
  -- Adet yalnız bitirme olayında vardır.
  CONSTRAINT uretim_kaydi_adet_olaya_bagli CHECK ((olay = 'bitir') = (saglam_adet IS NOT NULL))
);
CREATE INDEX uretim_kaydi_emir_idx ON uretim_kaydi (emir_id, id);

CREATE TRIGGER uretim_kaydi_degismez BEFORE UPDATE OR DELETE ON uretim_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_kaydi_bosaltilmaz BEFORE TRUNCATE ON uretim_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
