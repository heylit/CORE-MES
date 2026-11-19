-- 3445 a: Logo yönetim sayfasının akış günlüğü (okuma, yazma, bağlantı testi). Yalnız ekler; 30 günden eski satırı modül siler.
-- Gövde, adres, anahtar ve kayıt içeriği yazılmaz; ileti kırpılmış özet ya da sabit metindir (Risk K5).
CREATE TABLE logo_akis_gunlugu (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  akis text NOT NULL CONSTRAINT logo_akis_gunlugu_akis CHECK (akis ~ '^[a-z0-9-]{1,64}$'),
  yon text NOT NULL CONSTRAINT logo_akis_gunlugu_yon CHECK (yon IN ('okuma', 'yazma', 'istek', 'baglanti')),
  sonuc text NOT NULL CONSTRAINT logo_akis_gunlugu_sonuc CHECK (sonuc IN ('tamam', 'hata')),
  sayi int CONSTRAINT logo_akis_gunlugu_sayi CHECK (sayi IS NULL OR sayi >= 0),
  ileti text CONSTRAINT logo_akis_gunlugu_ileti CHECK (ileti IS NULL OR (btrim(ileti) <> '' AND length(ileti) <= 300))
);
CREATE INDEX logo_akis_gunlugu_zaman ON logo_akis_gunlugu (zaman, id);
CREATE INDEX logo_akis_gunlugu_akis_zaman ON logo_akis_gunlugu (akis, zaman, id);
