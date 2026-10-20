-- Firma kaydı finanstan çıkar, musteri-tedarikci modülüne geçer (kart #1164, kullanıcı kararları S1-S6, 2026-10-13):
-- dolu tablo yeniden adlandırılır (S2), kartın merkez adresine koordinat eklenir (S4), öteki adresler ayrı tabloda tutulur (S5),
-- sevkiyattaki firmaya bağlı noktaların koordinatı bir kez teslim adresi olarak kopyalanır (S4), işlemler aynı rollere taşınır (S6).
-- Satır, kimlik ve yabancı anahtarlar değişmez: ALTER TABLE ... RENAME bağlı kısıtları yeni ada taşır.

DO $$
DECLARE firma_sayisi bigint; nokta_sayisi bigint; islem_sayisi bigint;
BEGIN
  SELECT count(*) INTO firma_sayisi FROM finans_firma;
  SELECT count(*) INTO nokta_sayisi FROM sevkiyat_noktasi WHERE firma_id IS NOT NULL AND aktif;
  SELECT count(*) INTO islem_sayisi FROM rol_islemi WHERE islem IN ('finans.firma-oku', 'finans.firma-yaz');
  RAISE NOTICE 'finans_firma: % satır; firmaya bağlı aktif sevkiyat noktası: %; taşınacak rol işlemi: %', firma_sayisi, nokta_sayisi, islem_sayisi;
END $$;

ALTER TABLE finans_firma RENAME TO musteri_tedarikci_firma;
ALTER SEQUENCE finans_firma_id_seq RENAME TO musteri_tedarikci_firma_id_seq;
ALTER INDEX finans_firma_pkey RENAME TO musteri_tedarikci_firma_pkey;
ALTER INDEX finans_firma_kod_tekil RENAME TO musteri_tedarikci_firma_kod_tekil;
ALTER INDEX finans_firma_vergi_no_tekil RENAME TO musteri_tedarikci_firma_vergi_no_tekil;
ALTER INDEX finans_firma_logo_cari_kodu_tekil RENAME TO musteri_tedarikci_firma_logo_cari_kodu_tekil;
ALTER INDEX finans_firma_logo_kayit_no_tekil RENAME TO musteri_tedarikci_firma_logo_kayit_no_tekil;
ALTER INDEX finans_firma_ad_sirasi RENAME TO musteri_tedarikci_firma_ad_sirasi;
ALTER INDEX finans_firma_kod_sirasi RENAME TO musteri_tedarikci_firma_kod_sirasi;

ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_kod_bicim TO musteri_tedarikci_firma_kod_bicim;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_ad_bos TO musteri_tedarikci_firma_ad_bos;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_tur TO musteri_tedarikci_firma_tur;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_ulke_kodu TO musteri_tedarikci_firma_ulke_kodu;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_vergi_no_bicim TO musteri_tedarikci_firma_vergi_no_bicim;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_vergi_dairesi_uzunluk TO musteri_tedarikci_firma_vergi_dairesi_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_para_birimi TO musteri_tedarikci_firma_para_birimi;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_vade_gunu TO musteri_tedarikci_firma_vade_gunu;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_adres_uzunluk TO musteri_tedarikci_firma_adres_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_ilce_uzunluk TO musteri_tedarikci_firma_ilce_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_il_uzunluk TO musteri_tedarikci_firma_il_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_posta_kodu_uzunluk TO musteri_tedarikci_firma_posta_kodu_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_telefon_uzunluk TO musteri_tedarikci_firma_telefon_uzunluk;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_e_posta_bicim TO musteri_tedarikci_firma_e_posta_bicim;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_logo_cari_kodu_bicim TO musteri_tedarikci_firma_logo_cari_kodu_bicim;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_logo_kayit_no_pozitif TO musteri_tedarikci_firma_logo_kayit_no_pozitif;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_logo_gonderim TO musteri_tedarikci_firma_logo_gonderim;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_olusturan TO musteri_tedarikci_firma_olusturan;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_guncelleyen TO musteri_tedarikci_firma_guncelleyen;
ALTER TABLE musteri_tedarikci_firma RENAME CONSTRAINT finans_firma_surum_pozitif TO musteri_tedarikci_firma_surum_pozitif;

-- Tetikleyici gövdeleri kısıt adını metin olarak taşır: yeni adla yeniden kurulur, eskisi kaldırılır.
DROP TRIGGER finans_firma_degismezler ON musteri_tedarikci_firma;
DROP FUNCTION finans_firma_degismezler();
DROP TRIGGER finans_firma_silinmez ON musteri_tedarikci_firma;
DROP FUNCTION finans_firma_silinmez();

-- Logo'ya gönderilmiş firmanın kodu ve Logo cari kodu değişmez (MT-5); açan ve açılış zamanı hiç değişmez (MT-4).
CREATE FUNCTION musteri_tedarikci_firma_degismezler() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.olusturan_id IS DISTINCT FROM OLD.olusturan_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION 'Firmayı açan kişi ve açılış zamanı değişmez.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'musteri_tedarikci_firma_acilis_degismez';
  END IF;
  IF OLD.logo_kayit_no IS NOT NULL
     AND (NEW.kod IS DISTINCT FROM OLD.kod OR NEW.logo_cari_kodu IS DISTINCT FROM OLD.logo_cari_kodu) THEN
    RAISE EXCEPTION 'Logo''ya gönderilmiş firmanın kodu ve Logo cari kodu değişmez.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'musteri_tedarikci_firma_logo_kilidi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER musteri_tedarikci_firma_degismezler BEFORE UPDATE ON musteri_tedarikci_firma
  FOR EACH ROW EXECUTE FUNCTION musteri_tedarikci_firma_degismezler();

-- Firma silinmez, pasife alınır (MT-6).
CREATE FUNCTION musteri_tedarikci_firma_silinmez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Firma silinmez; pasife alınır.' USING ERRCODE = 'check_violation', CONSTRAINT = 'musteri_tedarikci_firma_silinmez';
END $$;
CREATE TRIGGER musteri_tedarikci_firma_silinmez BEFORE DELETE ON musteri_tedarikci_firma
  FOR EACH ROW EXECUTE FUNCTION musteri_tedarikci_firma_silinmez();

-- Finansın "pasif firmaya yeni kayıt açılmaz" tetikleyicisi tabloyu adıyla okur; gövde yeni adla yeniden yazılır, davranış aynı (FNS-46).
CREATE OR REPLACE FUNCTION finans_aktif_firma() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.firma_id IS NOT NULL THEN PERFORM 1 FROM musteri_tedarikci_firma WHERE id = NEW.firma_id FOR SHARE; END IF;
  IF NEW.firma_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM musteri_tedarikci_firma WHERE id = NEW.firma_id AND aktif) THEN
    RAISE EXCEPTION 'Pasif firmaya yeni kayıt açılamaz.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_pasif_firma';
  END IF;
  RETURN NEW;
END $$;

-- Kartın merkez adresinin koordinatı (S4): ondalık derece; ikisi birlikte dolu ya da boş (MT-7).
ALTER TABLE musteri_tedarikci_firma
  ADD COLUMN enlem numeric(9, 6) CONSTRAINT musteri_tedarikci_firma_enlem CHECK (enlem BETWEEN -90 AND 90),
  ADD COLUMN boylam numeric(9, 6) CONSTRAINT musteri_tedarikci_firma_boylam CHECK (boylam BETWEEN -180 AND 180),
  ADD CONSTRAINT musteri_tedarikci_firma_koordinat_butun CHECK ((enlem IS NULL) = (boylam IS NULL));

-- Kartın yanındaki adresler (S5): fatura, teslim, şube; her biri kendi koordinatıyla. Adres kaldırılınca satır silinir;
-- adres yazması kartın sürümünü artırır (servis), kendi sürümü yoktur.
CREATE TABLE musteri_tedarikci_adres (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id int NOT NULL CONSTRAINT musteri_tedarikci_adres_firma REFERENCES musteri_tedarikci_firma (id),
  tur text NOT NULL CONSTRAINT musteri_tedarikci_adres_tur CHECK (tur IN ('fatura', 'teslim', 'sube')),
  ad text NOT NULL CONSTRAINT musteri_tedarikci_adres_ad CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 100),
  adres text CONSTRAINT musteri_tedarikci_adres_adres_uzunluk CHECK (length(adres) <= 500),
  ilce text CONSTRAINT musteri_tedarikci_adres_ilce_uzunluk CHECK (length(ilce) <= 100),
  il text CONSTRAINT musteri_tedarikci_adres_il_uzunluk CHECK (length(il) <= 100),
  posta_kodu text CONSTRAINT musteri_tedarikci_adres_posta_kodu_uzunluk CHECK (length(posta_kodu) <= 20),
  enlem numeric(9, 6) CONSTRAINT musteri_tedarikci_adres_enlem CHECK (enlem BETWEEN -90 AND 90),
  boylam numeric(9, 6) CONSTRAINT musteri_tedarikci_adres_boylam CHECK (boylam BETWEEN -180 AND 180),
  olusturan_id int NOT NULL CONSTRAINT musteri_tedarikci_adres_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT musteri_tedarikci_adres_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  CONSTRAINT musteri_tedarikci_adres_koordinat_butun CHECK ((enlem IS NULL) = (boylam IS NULL))
);
-- Aynı firmada aynı adlı iki adres olmaz (MT-9).
CREATE UNIQUE INDEX musteri_tedarikci_adres_ad_tekil ON musteri_tedarikci_adres (firma_id, lower(ad));

-- Sevkiyattaki firmaya bağlı aktif noktanın koordinatı bir kez, noktanın adıyla teslim adresi olarak kopyalanır (S4). Sevkiyatın satırına dokunulmaz;
-- sevkiyat koordinatı bundan sonra bu adresten okur (BASKA-MODUL-ISTEKLERI). Kopyayı firmayı açan kişi açmış sayılır.
INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, adres, enlem, boylam, olusturan_id)
SELECT n.firma_id, 'teslim', left(btrim(n.ad), 100), nullif(btrim(left(n.adres, 500)), ''), n.enlem, n.boylam,
       (SELECT min(f.olusturan_id) FROM musteri_tedarikci_firma f WHERE f.id = n.firma_id)
  FROM sevkiyat_noktasi n
 WHERE n.firma_id IS NOT NULL AND n.aktif;

-- İşlemler aynı rollere aynı haklarla taşınır, beşi sayfayı görür (S6).
UPDATE rol_islemi SET islem = 'musteri-tedarikci.oku' WHERE islem = 'finans.firma-oku';
UPDATE rol_islemi SET islem = 'musteri-tedarikci.yaz' WHERE islem = 'finans.firma-yaz';
INSERT INTO rol_islemi (rol_id, islem)
SELECT rol_id, 'sayfa.musteri-tedarikci' FROM rol_islemi WHERE islem = 'musteri-tedarikci.oku'
ON CONFLICT DO NOTHING;
