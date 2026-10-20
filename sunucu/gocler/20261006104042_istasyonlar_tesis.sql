-- Tesis üç düzeydir (iş merkezi, istasyon, makine); kod kendi düzeyinde benzersiz ve değişebilir, bağlar sayı kimlikledir.
-- Kullanımdaki kayıt silinemez (yabancı anahtarlar kısıtlayıcıdır), pasife alınır.
CREATE TABLE is_merkezi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL UNIQUE CONSTRAINT is_merkezi_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  aciklama text,
  aktif boolean NOT NULL DEFAULT true
);

CREATE TABLE istasyon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL UNIQUE CONSTRAINT istasyon_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  is_merkezi_id int NOT NULL REFERENCES is_merkezi,
  tip text NOT NULL DEFAULT 'talasli' CONSTRAINT istasyon_tip_degeri CHECK (tip IN ('talasli', 'kalite', 'depo', 'markalama', 'boya', 'montaj')),
  aktif boolean NOT NULL DEFAULT true
);
CREATE INDEX istasyon_is_merkezi_idx ON istasyon (is_merkezi_id);

-- Makine istasyonsuz olabilir (yeni gelen makine). Bağlantı alanları yalnız kayıttır; toplayıcı yoktur.
CREATE TABLE makine (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL UNIQUE CONSTRAINT makine_kod_bicimi CHECK (kod ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  tur text,
  marka_model text,
  seri_no text,
  istasyon_id int REFERENCES istasyon,
  baglanti_turu text CONSTRAINT makine_baglanti_turu_degeri CHECK (baglanti_turu IN ('focas', 'opcua', 'mtconnect', 'modbus', 'dijital_giris')),
  baglanti_adresi text CONSTRAINT makine_adres_bos_degil CHECK (baglanti_adresi IS NULL OR btrim(baglanti_adresi) <> ''),
  aktif boolean NOT NULL DEFAULT true,
  CONSTRAINT makine_adres_tur_ister CHECK (baglanti_adresi IS NULL OR baglanti_turu IS NOT NULL)
);
CREATE INDEX makine_istasyon_idx ON makine (istasyon_id);

-- Liste boşsa kişi her iş merkezinde çalışır; satır varsa yalnız listedekilerde.
-- Kısıtı olan kişi silinemez: kısıt sessizce kaybolmaz, önce kaldırılır.
CREATE TABLE kisi_is_merkezi (
  kisi_id int NOT NULL REFERENCES kisi,
  is_merkezi_id int NOT NULL REFERENCES is_merkezi,
  PRIMARY KEY (kisi_id, is_merkezi_id)
);
CREATE INDEX kisi_is_merkezi_is_merkezi_idx ON kisi_is_merkezi (is_merkezi_id);
