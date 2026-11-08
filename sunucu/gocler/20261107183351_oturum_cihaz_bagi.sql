-- Cihaza bağlı oturum (kart 2226, karar 2226-6 a; W3C DBSC): tarayıcının cihaz çipindeki anahtarın açık yarısı ve kısa ömürlü
-- bağ çerezinin özeti. Satır yalnız bağlanan oturumda vardır; bağsız oturum bugünkü gibi sürer. Oturum silinince satır da gider.
-- Yalnız yeni, boş tablo.
CREATE TABLE oturum_cihaz_bagi (
  oturum_id bigint PRIMARY KEY CONSTRAINT oturum_cihaz_bagi_oturum_fk REFERENCES oturum ON DELETE CASCADE,
  -- Tarayıcıya verilen oturum kimliği (Sec-Secure-Session-Id); oturum anahtarından bağımsız rastgele değer.
  oturum_kimligi text NOT NULL CONSTRAINT oturum_cihaz_bagi_kimlik_tek UNIQUE
    CONSTRAINT oturum_cihaz_bagi_kimlik CHECK (length(oturum_kimligi) BETWEEN 16 AND 64),
  alg text NOT NULL CONSTRAINT oturum_cihaz_bagi_alg CHECK (alg IN ('ES256', 'RS256')),
  acik_anahtar jsonb NOT NULL CONSTRAINT oturum_cihaz_bagi_anahtar CHECK (jsonb_typeof(acik_anahtar) = 'object'),
  bag_ozeti text NOT NULL,
  bag_son timestamptz NOT NULL,
  -- Son kabul edilen kanıtın meydanı: aynı kanıt ikinci kez kullanılamaz.
  son_meydan text,
  baglandi timestamptz NOT NULL
);
