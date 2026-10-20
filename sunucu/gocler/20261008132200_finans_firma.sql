-- Firma kaydı finans modülündedir (K-14): satın alma, stok ve Logo firmayı buradan alır. Firma silinmez, pasife alınır.
CREATE TABLE finans_firma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text CONSTRAINT finans_firma_kod_bicim CHECK (kod IS NULL OR (btrim(kod) = kod AND length(kod) BETWEEN 1 AND 40)),
  ad text NOT NULL CONSTRAINT finans_firma_ad_bos CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  tur text NOT NULL CONSTRAINT finans_firma_tur CHECK (tur IN ('musteri', 'tedarikci', 'ikisi')),
  fason boolean NOT NULL DEFAULT false,
  ulke_kodu char(2) NOT NULL DEFAULT 'TR' CONSTRAINT finans_firma_ulke_kodu CHECK (ulke_kodu ~ '^[A-Z]{2}$'),
  -- Türkiye'de 10 hane vergi kimlik ya da 11 hane T.C. kimlik numarası; yabancı firmada serbest metin (D-9).
  vergi_no text CONSTRAINT finans_firma_vergi_no_bicim CHECK (
    vergi_no IS NULL
    OR (ulke_kodu = 'TR' AND vergi_no ~ '^[0-9]{10,11}$')
    OR (ulke_kodu <> 'TR' AND btrim(vergi_no) = vergi_no AND length(vergi_no) BETWEEN 1 AND 30)
  ),
  vergi_dairesi text CONSTRAINT finans_firma_vergi_dairesi_uzunluk CHECK (length(vergi_dairesi) <= 100),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT finans_firma_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  vade_gunu int CONSTRAINT finans_firma_vade_gunu CHECK (vade_gunu BETWEEN 0 AND 365),
  adres text CONSTRAINT finans_firma_adres_uzunluk CHECK (length(adres) <= 500),
  ilce text CONSTRAINT finans_firma_ilce_uzunluk CHECK (length(ilce) <= 100),
  il text CONSTRAINT finans_firma_il_uzunluk CHECK (length(il) <= 100),
  posta_kodu text CONSTRAINT finans_firma_posta_kodu_uzunluk CHECK (length(posta_kodu) <= 20),
  telefon text CONSTRAINT finans_firma_telefon_uzunluk CHECK (length(telefon) <= 40),
  e_posta text CONSTRAINT finans_firma_e_posta_bicim CHECK (e_posta ~ '^[^@\s]+@[^@\s]+$' AND length(e_posta) <= 200),
  aktif boolean NOT NULL DEFAULT true,
  logo_cari_kodu text CONSTRAINT finans_firma_logo_cari_kodu_bicim CHECK (btrim(logo_cari_kodu) = logo_cari_kodu AND length(logo_cari_kodu) BETWEEN 1 AND 40),
  logo_kayit_no int CONSTRAINT finans_firma_logo_kayit_no_pozitif CHECK (logo_kayit_no > 0),
  -- Firma TMI'de açılır ve Logo'ya gider; durumu yalnız Logo köprüsü yazar (köprü henüz yok).
  logo_gonderim_durumu text CONSTRAINT finans_firma_logo_gonderim CHECK (logo_gonderim_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  olusturan_id int NOT NULL CONSTRAINT finans_firma_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT finans_firma_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT finans_firma_surum_pozitif CHECK (surum >= 1)
);

CREATE UNIQUE INDEX finans_firma_kod_tekil ON finans_firma (upper(kod)) WHERE kod IS NOT NULL;
CREATE UNIQUE INDEX finans_firma_vergi_no_tekil ON finans_firma (vergi_no) WHERE vergi_no IS NOT NULL;
CREATE UNIQUE INDEX finans_firma_logo_cari_kodu_tekil ON finans_firma (upper(logo_cari_kodu)) WHERE logo_cari_kodu IS NOT NULL;
CREATE UNIQUE INDEX finans_firma_logo_kayit_no_tekil ON finans_firma (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
CREATE INDEX finans_firma_ad_sirasi ON finans_firma (ad, id);
CREATE INDEX finans_firma_kod_sirasi ON finans_firma (kod, id);

-- Logo'ya gönderilmiş firmanın kodu ve Logo cari kodu değişmez (FNS-45); açan ve açılış zamanı hiç değişmez (FNS-38).
CREATE FUNCTION finans_firma_degismezler() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.olusturan_id IS DISTINCT FROM OLD.olusturan_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION 'Firmayı açan kişi ve açılış zamanı değişmez.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_firma_acilis_degismez';
  END IF;
  IF OLD.logo_kayit_no IS NOT NULL
     AND (NEW.kod IS DISTINCT FROM OLD.kod OR NEW.logo_cari_kodu IS DISTINCT FROM OLD.logo_cari_kodu) THEN
    RAISE EXCEPTION 'Logo''ya gönderilmiş firmanın kodu ve Logo cari kodu değişmez.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_firma_logo_kilidi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_firma_degismezler BEFORE UPDATE ON finans_firma FOR EACH ROW EXECUTE FUNCTION finans_firma_degismezler();

-- Firma silinmez, pasife alınır (FNS-47): uygulama kullanıcısının silme hakkı olsa da satır kalır.
CREATE FUNCTION finans_firma_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Firma silinmez; pasife alınır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_firma_silinmez';
END $$;
CREATE TRIGGER finans_firma_silinmez BEFORE DELETE ON finans_firma FOR EACH ROW EXECUTE FUNCTION finans_firma_silinmez();
