-- Göz ataması: hangi kalem (parça no, malzeme kodu) hangi gözde ve gözün ne kadarını doldurur. Adet ve hareket stok
-- modülünündür (kullanıcı kararı); burada yalnız yer ve elle doluluk yüzdesi. Atanmış göz raf küçülünce silinmez (ATL-12).

CREATE TABLE atolye_goz_kalemi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  goz_id int NOT NULL REFERENCES atolye_goz,
  kod_anahtari text NOT NULL,
  kod text NOT NULL,
  ad text NOT NULL,
  doluluk smallint NOT NULL,
  kaydeden_kisi_id int NOT NULL REFERENCES kisi,
  kaydedildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atolye_goz_kalemi_tek UNIQUE (goz_id, kod_anahtari),
  CONSTRAINT atolye_goz_kalemi_kod CHECK (btrim(kod) <> '' AND length(kod) <= 60),
  CONSTRAINT atolye_goz_kalemi_anahtari CHECK (kod_anahtari <> '' AND kod_anahtari = btrim(kod_anahtari) AND kod_anahtari !~ '\s\s'),
  CONSTRAINT atolye_goz_kalemi_ad CHECK (btrim(ad) <> '' AND length(ad) <= 120),
  CONSTRAINT atolye_goz_kalemi_doluluk CHECK (doluluk BETWEEN 1 AND 100)
);
CREATE INDEX atolye_goz_kalemi_anahtar ON atolye_goz_kalemi (kod_anahtari);

-- Gözdeki kalemlerin toplam doluluğu %100'ü aşmaz; işlem sonunda denetlenir (iki kalem aynı komutta yer değişebilir).
CREATE FUNCTION atolye_goz_dolulugu() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT coalesce(sum(doluluk), 0) FROM atolye_goz_kalemi WHERE goz_id = NEW.goz_id) > 100 THEN
    RAISE EXCEPTION 'Gözün toplam doluluğu yüzde yüzü aşıyor' USING ERRCODE = 'check_violation', CONSTRAINT = 'atolye_goz_dolulugu';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER atolye_goz_dolulugu AFTER INSERT OR UPDATE ON atolye_goz_kalemi
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atolye_goz_dolulugu();
