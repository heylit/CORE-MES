-- 3399 a: kendi firmalarımızın kısa kodu tek listede durur; proje, malzeme kartı, teklif ve sipariş buradan seçer, numara
-- kalıpları {FIRMA} ile kullanır. Kod verildikten sonra değişmez ve silinmez (eski numara ve stok kodları ona dayanır), yalnız
-- pasif olur. Varsayılan tektir ve pasif olamaz. Biçim malzeme kartının eski firma kodu kuralıdır (kart #652): tür kısaltması olamaz.
CREATE TABLE ayar_firma_kodu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL CONSTRAINT ayar_firma_kodu_kod_tek UNIQUE
    CONSTRAINT ayar_firma_kodu_kod_bicimi CHECK (kod ~ '^[A-Z0-9]{2,5}$' AND kod NOT IN ('HM', 'YM', 'MM', 'SF', 'DB', 'HZ', 'TM')),
  ad text NOT NULL CONSTRAINT ayar_firma_kodu_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND length(ad) <= 80),
  varsayilan boolean NOT NULL DEFAULT false,
  aktif boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1,
  olusturan_kisi_id int REFERENCES kisi,
  guncelleyen_kisi_id int REFERENCES kisi,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ayar_firma_kodu_varsayilan_aktif CHECK (NOT varsayilan OR aktif)
);
CREATE UNIQUE INDEX ayar_firma_kodu_tek_varsayilan ON ayar_firma_kodu (varsayilan) WHERE varsayilan;

-- Malzeme ayarlarındaki tek firma kodu (genel.firmaKodu) listenin ilk ve varsayılan satırı olur; adı Sistem Ayarları'ndaki firma
-- adıdır, yoksa kodun kendisi. Malzeme ayarındaki değer silinmez, artık okunmaz. Biçime uymayan eski değer (kart #652 kuralından
-- önce yazılmış olabilir) taşınmaz: o kurulumda mamul öneki zaten okunmuyordu (katalogFirmaKodu biçimsizi yok sayar).
INSERT INTO ayar_firma_kodu (kod, ad, varsayilan)
SELECT m.deger ->> 'firmaKodu',
       COALESCE(NULLIF(btrim(left(btrim((SELECT a.deger #>> '{}' FROM ayar a WHERE a.anahtar = 'kabuk.kurum-adi')), 80)), ''), m.deger ->> 'firmaKodu'),
       true
  FROM malzeme_katalog_ayari m
 WHERE m.anahtar = 'genel'
   AND (m.deger ->> 'firmaKodu') ~ '^[A-Z0-9]{2,5}$'
   AND (m.deger ->> 'firmaKodu') NOT IN ('HM', 'YM', 'MM', 'SF', 'DB', 'HZ', 'TM');

-- Kalıpta {FIRMA} varsa her firma kendi sırasını yürütür; {FIRMA}'sız kalıbın sayacı boş firma ('') satırıdır.
ALTER TABLE ayar_numara_sayaci
  ADD COLUMN firma_kodu text NOT NULL DEFAULT ''
    CONSTRAINT ayar_numara_sayaci_firma_bicimi CHECK (firma_kodu ~ '^([A-Z0-9]{2,5})?$'),
  DROP CONSTRAINT ayar_numara_sayaci_pk,
  ADD CONSTRAINT ayar_numara_sayaci_pk PRIMARY KEY (anahtar, donem, firma_kodu);

-- Taşınan kod bugüne kadarki sayaçtan devam eder (üretim emri numarası ondan sürer); yeni kodlar 1'den başlar.
INSERT INTO ayar_numara_sayaci (anahtar, donem, firma_kodu, son_sira)
SELECT s.anahtar, s.donem, f.kod, s.son_sira
  FROM ayar_numara_sayaci s CROSS JOIN ayar_firma_kodu f
 WHERE s.firma_kodu = '';
