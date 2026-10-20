-- Proje kaydı (kart #803): üretim emri numarasındaki proje no buradan gelir; kod Logo'daki proje koduyla eşleşebilecek biçimdedir.
CREATE TABLE projeler_proje (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Tire yok: emir numarasında parçaları tire ayırır. 24 karakter Logo stok kodu sınırıdır; proje kodu için doğrulanmadı.
  kod text NOT NULL CONSTRAINT projeler_proje_kod_bicim CHECK (kod ~ '^[A-Z0-9._]{1,24}$'),
  ad text NOT NULL CONSTRAINT projeler_proje_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 200),
  durum text NOT NULL DEFAULT 'aktif' CONSTRAINT projeler_proje_durum CHECK (durum IN ('aktif', 'tamamlandi', 'iptal')),
  firma_id int CONSTRAINT projeler_proje_firma REFERENCES finans_firma (id),
  baslangic date,
  bitis date,
  aciklama text CONSTRAINT projeler_proje_aciklama_uzunluk CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  olusturan_id int NOT NULL CONSTRAINT projeler_proje_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT projeler_proje_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_proje_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT projeler_proje_tarih_sirasi CHECK (bitis IS NULL OR baslangic IS NULL OR bitis >= baslangic)
);

CREATE UNIQUE INDEX projeler_proje_kod_tekil ON projeler_proje (kod);
CREATE INDEX projeler_proje_ad_sirasi ON projeler_proje (ad, id);

-- Kod emir numaralarına girer; açılıştan sonra değişirse eski emirler artık bulunamayan bir koda işaret eder (PRJ-03).
CREATE FUNCTION projeler_proje_degismezler() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kod IS DISTINCT FROM OLD.kod THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_proje_kod_degismez',
      MESSAGE = 'Proje kodu açıldıktan sonra değişmez.';
  END IF;
  IF NEW.olusturan_id IS DISTINCT FROM OLD.olusturan_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_proje_acilis_degismez',
      MESSAGE = 'Projeyi açan ve açılış zamanı değişmez.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projeler_proje_degismezler BEFORE UPDATE ON projeler_proje
  FOR EACH ROW EXECUTE FUNCTION projeler_proje_degismezler();
