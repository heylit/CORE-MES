-- Duruş ve hurda nedeni tanımları ve ilk kurulum listesi; nedenler silinmez, pasife alınır.

CREATE TABLE durus_nedeni (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL,
  ad text NOT NULL,
  simge text,
  kategori text NOT NULL,
  cagri_ekibi text,
  cagri_gecikme_dk int,
  aktif boolean NOT NULL DEFAULT true,
  sira int NOT NULL,
  CONSTRAINT durus_nedeni_kod_benzersiz UNIQUE (kod),
  CONSTRAINT durus_nedeni_kod_bicimi CHECK (kod ~ '^[A-Z0-9-]{1,12}$'),
  CONSTRAINT durus_nedeni_ad_dolu CHECK (btrim(ad) <> '' AND char_length(ad) <= 80),
  CONSTRAINT durus_nedeni_simge_bicimi CHECK (simge IS NULL OR simge ~ '^[a-z0-9-]{1,30}$'),
  CONSTRAINT durus_nedeni_kategori CHECK (kategori IN ('plansiz', 'planli')),
  CONSTRAINT durus_nedeni_ekip CHECK (cagri_ekibi IS NULL OR cagri_ekibi IN ('bakim', 'kalite', 'malzeme', 'amir')),
  CONSTRAINT durus_nedeni_gecikme CHECK (cagri_gecikme_dk IS NULL OR cagri_gecikme_dk >= 0),
  CONSTRAINT durus_nedeni_cagri_birlikte CHECK ((cagri_ekibi IS NULL) = (cagri_gecikme_dk IS NULL)),
  CONSTRAINT durus_nedeni_planlida_cagri_yok CHECK (kategori = 'plansiz' OR cagri_ekibi IS NULL)
);

CREATE TABLE hurda_nedeni (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kod text NOT NULL,
  ad text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  sira int NOT NULL,
  CONSTRAINT hurda_nedeni_kod_benzersiz UNIQUE (kod),
  CONSTRAINT hurda_nedeni_kod_bicimi CHECK (kod ~ '^[A-Z0-9-]{1,12}$'),
  CONSTRAINT hurda_nedeni_ad_dolu CHECK (btrim(ad) <> '' AND char_length(ad) <= 80)
);

-- Hazır nedenler çağrısız gelir: hangi nedenin hangi ekibi kaç dakikada çağıracağını yönetici ekrandan girer.
INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES
  ('D-01', 'Malzeme bekleniyor', 'plansiz', 1),
  ('D-02', 'Mekanik arıza', 'plansiz', 2),
  ('D-03', 'Elektrik / kontrol arızası', 'plansiz', 3),
  ('D-04', 'Takım / kalıp değişimi', 'plansiz', 4),
  ('D-05', 'Kalite kontrol bekleniyor', 'plansiz', 5),
  ('D-06', 'Program / CNC hatası', 'plansiz', 6),
  ('D-07', 'Operatör yok', 'plansiz', 7),
  ('D-08', 'Planlı bakım', 'planli', 8),
  ('D-09', 'Mola / yemek', 'planli', 9),
  ('D-10', 'Toplantı / eğitim', 'planli', 10),
  ('D-11', 'İş emri yok', 'planli', 11),
  ('D-12', 'Deneme / numune üretimi', 'planli', 12);

INSERT INTO hurda_nedeni (kod, ad, sira) VALUES
  ('H-01', 'Ölçü dışı', 1),
  ('H-02', 'Yüzey hatası', 2),
  ('H-03', 'Malzeme hatası', 3),
  ('H-04', 'Ayar parçası', 4),
  ('H-05', 'Takım kırılması', 5),
  ('H-06', 'Çapak / şekil bozukluğu', 6),
  ('H-07', 'Diğer', 7);
