-- Nizamiye 1: kapıdaki ziyaret defteri ve ziyaretçi kartı rafı (kararlar 165 a, 166 a, 167 a, 173 a, 174 a). İki yeni ve boş tablo.
-- Kartın "kullanımda" hali saklanmaz, içerideki ziyaretten okunur: iki yerde tutulan durum ayrışırdı. Aynı kartın iki içerideki
-- ziyarete verilmemesi kısıtla sağlanır. Tam kimlik numarası hiç saklanmaz (166 a): yalnız tür ve son dört hane.
CREATE TABLE nizamiye_kart (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kart_no text NOT NULL CONSTRAINT nizamiye_kart_no_bicim CHECK (kart_no ~ '^[A-Z0-9-]{1,12}$'),
  tur text NOT NULL CONSTRAINT nizamiye_kart_tur_secenek CHECK (tur IN ('ziyaretci', 'taseron')),
  izinli_bolge text CONSTRAINT nizamiye_kart_bolge_uzunluk CHECK (izinli_bolge IS NULL OR length(izinli_bolge) BETWEEN 1 AND 120),
  durum text NOT NULL DEFAULT 'bos' CONSTRAINT nizamiye_kart_durum_secenek CHECK (durum IN ('bos', 'kayip', 'hasarli')),
  durum_notu text CONSTRAINT nizamiye_kart_not_uzunluk CHECK (durum_notu IS NULL OR length(durum_notu) <= 300),
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT nizamiye_kart_no_benzersiz UNIQUE (kart_no)
);

CREATE TABLE nizamiye_ziyaret (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ziyaret_no text NOT NULL CONSTRAINT nizamiye_ziyaret_no_benzersiz UNIQUE,
  -- Ad ve telefon saklama süresi dolunca silinir (167 a); satır, saatler ve ev sahibi kalır.
  ad text CONSTRAINT nizamiye_ziyaret_ad_uzunluk CHECK (ad IS NULL OR length(ad) BETWEEN 1 AND 120),
  anonimlesme timestamptz,
  firma_adi text CONSTRAINT nizamiye_ziyaret_firma_uzunluk CHECK (firma_adi IS NULL OR length(firma_adi) BETWEEN 1 AND 120),
  telefon text CONSTRAINT nizamiye_ziyaret_telefon_bicim CHECK (telefon IS NULL OR telefon ~ '^[0-9 +()-]{4,20}$'),
  neden text NOT NULL CONSTRAINT nizamiye_ziyaret_neden_secenek
    CHECK (neden IN ('toplanti', 'teslimat', 'servis', 'denetim', 'is_gorusmesi', 'diger')),
  aciklama text CONSTRAINT nizamiye_ziyaret_aciklama_uzunluk CHECK (aciklama IS NULL OR length(aciklama) <= 200),
  plaka text CONSTRAINT nizamiye_ziyaret_plaka_bicim CHECK (plaka IS NULL OR plaka ~ '^[0-9A-Z ]{2,12}$'),
  ev_sahibi_kisi_id int NOT NULL CONSTRAINT nizamiye_ziyaret_ev_sahibi REFERENCES kisi (id),
  beklenen_zaman timestamptz,
  ogle_yemegi boolean NOT NULL DEFAULT false,
  kimlik_goruldu boolean NOT NULL DEFAULT false,
  kimlik_turu text CONSTRAINT nizamiye_ziyaret_kimlik_turu_secenek CHECK (kimlik_turu IN ('tc_kimlik', 'pasaport', 'ehliyet', 'diger')),
  kimlik_son4 text CONSTRAINT nizamiye_ziyaret_kimlik_son4_bicim CHECK (kimlik_son4 ~ '^[0-9A-Z]{4}$'),
  atolye boolean NOT NULL DEFAULT false,
  dizustu boolean NOT NULL DEFAULT false,
  kvkk_onayi boolean NOT NULL DEFAULT false,
  ekipman_kontrol boolean,
  kart_id int CONSTRAINT nizamiye_ziyaret_kart REFERENCES nizamiye_kart (id),
  kart_teslim boolean,
  durum text NOT NULL CONSTRAINT nizamiye_ziyaret_durum_secenek CHECK (durum IN ('beklenen', 'iceride', 'cikti', 'iptal')),
  giris timestamptz,
  giren_kisi_id int CONSTRAINT nizamiye_ziyaret_giren REFERENCES kisi (id),
  cikis timestamptz,
  cikaran_kisi_id int CONSTRAINT nizamiye_ziyaret_cikaran REFERENCES kisi (id),
  iptal_zaman timestamptz,
  iptal_eden_kisi_id int CONSTRAINT nizamiye_ziyaret_iptal_eden REFERENCES kisi (id),
  olusturan_kisi_id int NOT NULL CONSTRAINT nizamiye_ziyaret_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT nizamiye_ziyaret_ad_dolu CHECK (ad IS NOT NULL OR anonimlesme IS NOT NULL),
  CONSTRAINT nizamiye_ziyaret_kimlik_butun CHECK (kimlik_son4 IS NULL OR kimlik_turu IS NOT NULL),
  CONSTRAINT nizamiye_ziyaret_beklenen_butun CHECK (durum <> 'beklenen' OR (giris IS NULL AND kart_id IS NULL AND beklenen_zaman IS NOT NULL)),
  -- İçerideki ve çıkmış ziyaretin girişi, kartı ve görülmüş kimliği vardır.
  CONSTRAINT nizamiye_ziyaret_giris_butun CHECK (
    durum NOT IN ('iceride', 'cikti') OR (giris IS NOT NULL AND giren_kisi_id IS NOT NULL AND kart_id IS NOT NULL AND kimlik_goruldu)
  ),
  CONSTRAINT nizamiye_ziyaret_cikis_butun CHECK ((durum = 'cikti') = (cikis IS NOT NULL AND cikaran_kisi_id IS NOT NULL AND kart_teslim IS NOT NULL)),
  CONSTRAINT nizamiye_ziyaret_iptal_butun CHECK ((durum = 'iptal') = (iptal_zaman IS NOT NULL AND iptal_eden_kisi_id IS NOT NULL)),
  CONSTRAINT nizamiye_ziyaret_cikis_sonra CHECK (cikis IS NULL OR cikis >= giris)
);

CREATE UNIQUE INDEX nizamiye_ziyaret_kart_icerde ON nizamiye_ziyaret (kart_id) WHERE durum = 'iceride';
CREATE INDEX nizamiye_ziyaret_ev_sahibi_dizin ON nizamiye_ziyaret (ev_sahibi_kisi_id, olusturma);
CREATE INDEX nizamiye_ziyaret_acik_dizin ON nizamiye_ziyaret (durum) WHERE durum IN ('beklenen', 'iceride');
CREATE INDEX nizamiye_ziyaret_olusturma_dizin ON nizamiye_ziyaret (olusturma, id);
