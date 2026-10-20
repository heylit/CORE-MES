-- Akıllı saat (kart #1632): saat bir eşleşme isteği açar ve kısa kodu gösterir; oturumu açık kişi kodu TMI'da onaylar; saat
-- isteğin gizli anahtarıyla, yalnız okuma yapan ve en çok 12 saat geçerli belirteci alır. Kod, gizli anahtar ve belirteç
-- saklanmaz; yalnız özetleri tutulur (oturum anahtarıyla aynı neden).
CREATE TABLE oturum_saat_istegi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gizli_ozeti text NOT NULL CONSTRAINT oturum_saat_istegi_gizli_tekil UNIQUE,
  kod_ozeti text NOT NULL CONSTRAINT oturum_saat_istegi_kod_tekil UNIQUE,
  ip text NOT NULL,
  olusturma timestamptz NOT NULL,
  son timestamptz NOT NULL,
  kisi_id int CONSTRAINT oturum_saat_istegi_kisi_fk REFERENCES kisi,
  onaylandi timestamptz,
  alindi timestamptz,
  son_soru timestamptz,
  CONSTRAINT oturum_saat_istegi_sure CHECK (son > olusturma AND son <= olusturma + interval '10 minutes'),
  CONSTRAINT oturum_saat_istegi_onay_butun CHECK ((kisi_id IS NULL) = (onaylandi IS NULL)),
  CONSTRAINT oturum_saat_istegi_alis_onayli CHECK (alindi IS NULL OR onaylandi IS NOT NULL)
);
CREATE INDEX oturum_saat_istegi_ip ON oturum_saat_istegi (ip);

CREATE TABLE oturum_saat_belirteci (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  belirtec_ozeti text NOT NULL CONSTRAINT oturum_saat_belirteci_tekil UNIQUE,
  kisi_id int NOT NULL CONSTRAINT oturum_saat_belirteci_kisi_fk REFERENCES kisi,
  acildi timestamptz NOT NULL,
  son timestamptz NOT NULL,
  kapandi timestamptz,
  kapatan_kisi_id int CONSTRAINT oturum_saat_belirteci_kapatan_fk REFERENCES kisi,
  -- 12 saat sınırı kısıttadır: kod hatası daha uzun belirteç yazamaz.
  CONSTRAINT oturum_saat_belirteci_sure CHECK (son > acildi AND son <= acildi + interval '12 hours'),
  CONSTRAINT oturum_saat_belirteci_kapanis_butun CHECK ((kapandi IS NULL) = (kapatan_kisi_id IS NULL))
);
CREATE INDEX oturum_saat_belirteci_kisi ON oturum_saat_belirteci (kisi_id);
