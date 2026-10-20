-- Etiket yazıcıları ve baskı kaydı (kullanıcı kararı 98 evet, 18.10.2026): ağdaki yazıcıya doğrudan baskı yalnız kurum içi aralıktaki adrese.
-- Kapı sabit 9100 olduğundan saklanmaz; aralık ortam değişkenindedir (TMIV2_ETIKET_YAZICI_AGI), tabloda değil.
CREATE TABLE etiket_merkezi_yazici (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT etiket_merkezi_yazici_ad_dolu CHECK (btrim(ad) <> '' AND length(ad) <= 80),
  dil text NOT NULL CONSTRAINT etiket_merkezi_yazici_dil CHECK (dil IN ('zpl', 'pplb')),
  dpi int NOT NULL CONSTRAINT etiket_merkezi_yazici_dpi CHECK (dpi IN (203, 300)),
  -- ag: sunucu adrese doğrudan gönderir; dosya: komut dosyası indirilir (USB ya da Windows yazıcısı).
  baglanti text NOT NULL CONSTRAINT etiket_merkezi_yazici_baglanti CHECK (baglanti IN ('ag', 'dosya')),
  adres inet,
  sade boolean NOT NULL DEFAULT false,
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1,
  degistiren_kisi_id int NOT NULL REFERENCES kisi,
  degisme_zamani timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etiket_merkezi_yazici_ad_tekil UNIQUE (ad),
  CONSTRAINT etiket_merkezi_yazici_ag_adresi CHECK ((baglanti = 'ag') = (adres IS NOT NULL)),
  CONSTRAINT etiket_merkezi_yazici_tek_adres CHECK (adres IS NULL OR masklen(adres) = CASE family(adres) WHEN 4 THEN 32 ELSE 128 END)
);

-- Baskı defteri yalnız eklenir: hangi etiketin kim tarafından, hangi yazıcıya, ne zaman basıldığı izlenebilirlik kaydıdır.
CREATE TABLE etiket_merkezi_baski (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  yazici_id int NOT NULL REFERENCES etiket_merkezi_yazici,
  sablon_anahtar text NOT NULL CONSTRAINT etiket_merkezi_baski_sablon CHECK (sablon_anahtar ~ '^[a-z0-9-]{1,40}$'),
  adet int NOT NULL CONSTRAINT etiket_merkezi_baski_adet CHECK (adet BETWEEN 1 AND 500),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  sonuc text NOT NULL CONSTRAINT etiket_merkezi_baski_sonuc CHECK (sonuc IN ('gonderildi', 'hata')),
  hata text CONSTRAINT etiket_merkezi_baski_hata CHECK ((sonuc = 'hata') = (hata IS NOT NULL))
);
CREATE INDEX etiket_merkezi_baski_zaman ON etiket_merkezi_baski (zaman, id);
CREATE TRIGGER etiket_merkezi_baski_degismez BEFORE UPDATE OR DELETE ON etiket_merkezi_baski
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
