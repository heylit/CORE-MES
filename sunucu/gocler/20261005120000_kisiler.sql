-- Kişi tek kayıttır: giriş bilgisi olan kişi kullanıcıdır, olmayan yalnız personeldir.
CREATE TABLE rol (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL UNIQUE CHECK (kod ~ '^[a-z][a-z0-9_]*$'),
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  yerlesik boolean NOT NULL DEFAULT false,
  yonetici boolean NOT NULL DEFAULT false
);

CREATE TABLE rol_sayfa_yetkisi (
  rol_id int NOT NULL REFERENCES rol ON DELETE CASCADE,
  sayfa text NOT NULL,
  duzey text NOT NULL CHECK (duzey IN ('oku', 'yaz', 'yonet')),
  PRIMARY KEY (rol_id, sayfa)
);

CREATE TABLE rol_yetenegi (
  rol_id int NOT NULL REFERENCES rol ON DELETE CASCADE,
  yetenek text NOT NULL,
  PRIMARY KEY (rol_id, yetenek)
);

CREATE TABLE kisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CHECK (btrim(ad) <> ''),
  aktif boolean NOT NULL DEFAULT true,
  rol_id int REFERENCES rol,
  kullanici_adi text CHECK (kullanici_adi ~ '^[a-z0-9._-]{3,40}$'),
  parola_ozeti text,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kisi_giris_butun CHECK ((kullanici_adi IS NULL) = (parola_ozeti IS NULL)),
  CONSTRAINT kisi_giris_rol_ister CHECK (kullanici_adi IS NULL OR rol_id IS NOT NULL)
);
CREATE UNIQUE INDEX kisi_kullanici_adi_tek ON kisi (kullanici_adi);

-- Kişiye özel satır rol şablonunu ezer; 'yok' rolün verdiği sayfayı kapatır.
CREATE TABLE kisi_sayfa_yetkisi (
  kisi_id int NOT NULL REFERENCES kisi ON DELETE CASCADE,
  sayfa text NOT NULL,
  duzey text NOT NULL CHECK (duzey IN ('yok', 'oku', 'yaz', 'yonet')),
  PRIMARY KEY (kisi_id, sayfa)
);

INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES
  ('yonetici', 'Yönetici', true, true),
  ('planlamaci', 'Planlamacı', true, false),
  ('operator', 'Operatör', true, false);
