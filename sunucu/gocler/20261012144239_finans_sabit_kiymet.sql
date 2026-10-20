-- Makine ve demirbaşın yönetim amaçlı amortismanı (Logo'ya gitmez). Bedel alış günü kuruyla saklanır: sonra girilen kur geçmişi değiştirmez.
-- Makine kodu istasyonlar modülünün makine kodudur; yabancı anahtar modüller bağlanınca ayrı göçle gelir.
CREATE TABLE finans_sabit_kiymet (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT finans_sabit_kiymet_ad CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  makine_kodu text CONSTRAINT finans_sabit_kiymet_makine_kodu CHECK (makine_kodu ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT finans_sabit_kiymet_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  bedel numeric(18,2) NOT NULL CONSTRAINT finans_sabit_kiymet_bedel CHECK (bedel > 0),
  kur numeric(18,6) NOT NULL CONSTRAINT finans_sabit_kiymet_kur CHECK (kur > 0 AND (para_birimi <> 'TRY' OR kur = 1)),
  alis_tarihi date NOT NULL,
  omur_ay smallint NOT NULL CONSTRAINT finans_sabit_kiymet_omur CHECK (omur_ay BETWEEN 1 AND 600),
  yontem text NOT NULL DEFAULT 'normal' CONSTRAINT finans_sabit_kiymet_yontem CHECK (yontem IN ('normal', 'azalan')),
  kalinti_degeri numeric(18,2) NOT NULL DEFAULT 0 CONSTRAINT finans_sabit_kiymet_kalinti CHECK (kalinti_degeri >= 0 AND kalinti_degeri < bedel),
  -- Sistemden önce alınmış kıymet: devir tarihine kadar birikmiş amortisman (TL) elle girilir, hesap oradan sürer.
  devir_tarihi date,
  devir_birikmis_tl numeric(18,2),
  CONSTRAINT finans_sabit_kiymet_devir CHECK (
    (devir_tarihi IS NULL) = (devir_birikmis_tl IS NULL)
    AND (devir_tarihi IS NULL OR devir_tarihi >= alis_tarihi)
    AND (devir_birikmis_tl IS NULL OR (devir_birikmis_tl >= 0 AND devir_birikmis_tl <= round((bedel - kalinti_degeri) * kur, 2)))),
  pasif_tarihi date CONSTRAINT finans_sabit_kiymet_pasif CHECK (pasif_tarihi IS NULL OR pasif_tarihi >= alis_tarihi),
  aciklama text CONSTRAINT finans_sabit_kiymet_aciklama CHECK (length(aciklama) <= 500),
  surum int NOT NULL DEFAULT 1,
  olusturan_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);
