-- Vardiya takvimi (kart #410): vardiya saatleri ve molaları, iş merkezi x hafta günü vardiya matrisi, tesis geneli tatil ve kapalı günler, kişinin vardiyası.
-- Kapasite molalar düşülmüş net süredir; bitiş başlangıçtan önceyse vardiya gece yarısını geçer ve başladığı güne sayılır.
CREATE TABLE vardiya (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT vardiya_pk PRIMARY KEY,
  ad text NOT NULL CONSTRAINT vardiya_ad_dolu CHECK (btrim(ad) <> '' AND char_length(ad) <= 40),
  baslangic time NOT NULL CONSTRAINT vardiya_baslangic_dakika CHECK (date_trunc('minute', baslangic) = baslangic),
  bitis time NOT NULL CONSTRAINT vardiya_bitis_dakika CHECK (date_trunc('minute', bitis) = bitis),
  aktif boolean NOT NULL DEFAULT true,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT vardiya_sure_var CHECK (baslangic <> bitis),
  CONSTRAINT vardiya_ad_tekil UNIQUE (ad)
);

-- Molalar vardiyanın parçasıdır: vardiya güncellenirken yeniden yazılır ve vardiyanın sürümünü artırır.
CREATE TABLE vardiya_molasi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT vardiya_molasi_pk PRIMARY KEY,
  vardiya_id int NOT NULL CONSTRAINT vardiya_molasi_vardiya_fk REFERENCES vardiya ON DELETE CASCADE,
  baslangic time NOT NULL CONSTRAINT vardiya_molasi_baslangic_dakika CHECK (date_trunc('minute', baslangic) = baslangic),
  bitis time NOT NULL CONSTRAINT vardiya_molasi_bitis_dakika CHECK (date_trunc('minute', bitis) = bitis),
  CONSTRAINT vardiya_molasi_sure_var CHECK (baslangic <> bitis)
);
CREATE INDEX vardiya_molasi_vardiya_idx ON vardiya_molasi (vardiya_id);

-- Gün: 1 pazartesi ... 7 pazar (ISO). Satır varsa o iş merkezinde o gün o vardiya açıktır.
CREATE TABLE vardiya_matrisi (
  is_merkezi_id int NOT NULL CONSTRAINT vardiya_matrisi_is_merkezi_fk REFERENCES is_merkezi,
  gun smallint NOT NULL CONSTRAINT vardiya_matrisi_gun CHECK (gun BETWEEN 1 AND 7),
  vardiya_id int NOT NULL CONSTRAINT vardiya_matrisi_vardiya_fk REFERENCES vardiya,
  CONSTRAINT vardiya_matrisi_pk PRIMARY KEY (is_merkezi_id, gun, vardiya_id)
);
CREATE INDEX vardiya_matrisi_vardiya_idx ON vardiya_matrisi (vardiya_id);

-- Tesis geneli: bütün iş merkezlerinde o gün başlayan vardiyaları sıfırlar.
CREATE TABLE vardiya_takvim_gunu (
  tarih date CONSTRAINT vardiya_takvim_gunu_pk PRIMARY KEY,
  tur text NOT NULL CONSTRAINT vardiya_takvim_gunu_tur CHECK (tur IN ('tatil', 'kapali')),
  ad text CONSTRAINT vardiya_takvim_gunu_ad_bicimi CHECK (ad IS NULL OR (btrim(ad) <> '' AND char_length(ad) <= 80))
);

-- Kişinin vardiyası (prototip personel kartı): kişinin takvimi iş merkezinin o gün açık olan bu vardiyasıdır. Satır yoksa vardiya seçilmemiştir.
CREATE TABLE vardiya_kisi (
  kisi_id int CONSTRAINT vardiya_kisi_pk PRIMARY KEY CONSTRAINT vardiya_kisi_kisi_fk REFERENCES kisi,
  vardiya_id int NOT NULL CONSTRAINT vardiya_kisi_vardiya_fk REFERENCES vardiya
);
CREATE INDEX vardiya_kisi_vardiya_idx ON vardiya_kisi (vardiya_id);
