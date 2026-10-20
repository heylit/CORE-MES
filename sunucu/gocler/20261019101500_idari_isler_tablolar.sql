-- İdari İşler 1: tesis talepleri (188 a). Yeni, boş tablolar; başka modülün tablosuna yalnız yabancı anahtarla bağlanır.

CREATE TABLE idari_isler_numara_sayaci (
  yil int NOT NULL CONSTRAINT idari_isler_numara_sayaci_pk PRIMARY KEY CONSTRAINT idari_isler_numara_sayaci_yil CHECK (yil BETWEEN 2000 AND 9999),
  son_sira int NOT NULL CONSTRAINT idari_isler_numara_sayaci_sira CHECK (son_sira > 0)
);

CREATE TABLE idari_isler_talep (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_talep_pk PRIMARY KEY,
  no text NOT NULL CONSTRAINT idari_isler_talep_no_tekil UNIQUE,
  kategori text NOT NULL CONSTRAINT idari_isler_talep_kategori
    CHECK (kategori IN ('elektrik', 'su', 'klima', 'bina', 'temizlik', 'yemekhane', 'kirtasiye', 'diger')),
  yer text NOT NULL CONSTRAINT idari_isler_talep_yer CHECK (btrim(yer) <> '' AND length(yer) <= 120),
  aciklama text CONSTRAINT idari_isler_talep_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 1000)),
  aciliyet text NOT NULL DEFAULT 'normal' CONSTRAINT idari_isler_talep_aciliyet CHECK (aciliyet IN ('normal', 'acil')),
  durum text NOT NULL DEFAULT 'yeni' CONSTRAINT idari_isler_talep_durum
    CHECK (durum IN ('yeni', 'yapiliyor', 'kapandi', 'reddedildi', 'geri_cekildi')),
  acan_kisi_id int NOT NULL CONSTRAINT idari_isler_talep_acan REFERENCES kisi (id),
  acilma timestamptz NOT NULL DEFAULT now(),
  ustlenen_kisi_id int CONSTRAINT idari_isler_talep_ustlenen REFERENCES kisi (id),
  ustlenme timestamptz,
  kapatan_kisi_id int CONSTRAINT idari_isler_talep_kapatan REFERENCES kisi (id),
  kapanma timestamptz,
  sonuc_notu text CONSTRAINT idari_isler_talep_sonuc_notu CHECK (sonuc_notu IS NULL OR (btrim(sonuc_notu) <> '' AND length(sonuc_notu) <= 500)),
  surum int NOT NULL DEFAULT 1 CONSTRAINT idari_isler_talep_surum CHECK (surum > 0),
  -- IDR-02: yapılan işin üstleneni vardır; son durumun kapanış zamanı ve kapatanı vardır, açık talebin yoktur.
  CONSTRAINT idari_isler_talep_ustlenen_butun CHECK ((ustlenen_kisi_id IS NULL) = (ustlenme IS NULL)),
  CONSTRAINT idari_isler_talep_yapiliyor_ustlenen CHECK (durum <> 'yapiliyor' OR ustlenen_kisi_id IS NOT NULL),
  CONSTRAINT idari_isler_talep_kapanis CHECK (
    (durum IN ('kapandi', 'reddedildi', 'geri_cekildi')) = (kapanma IS NOT NULL AND kapatan_kisi_id IS NOT NULL)
  ),
  -- IDR-04: red nedensiz olmaz.
  CONSTRAINT idari_isler_talep_red_nedeni CHECK (durum <> 'reddedildi' OR sonuc_notu IS NOT NULL)
);

-- Pano açık talepleri ve son kapananları, Taleplerim kişinin kendi taleplerini zamana göre okur.
CREATE INDEX idari_isler_talep_durum_acilma ON idari_isler_talep (durum, acilma, id);
CREATE INDEX idari_isler_talep_kapanma ON idari_isler_talep (kapanma, id) WHERE kapanma IS NOT NULL;
CREATE INDEX idari_isler_talep_acan_acilma ON idari_isler_talep (acan_kisi_id, acilma, id);
