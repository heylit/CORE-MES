-- Planın istasyon ve makine girdileri ile kişinin çalışabildiği istasyonlar (T2, kart #409). Üçü de yeni ve boş başlar;
-- satırı olmayan istasyon verim %100 ve operatör 1, satırı olmayan makine çalışır, yetkinliği yazılmamış kişi hiçbir istasyonda yetkin değildir.
DO $$ DECLARE istasyon_sayisi bigint; makine_sayisi bigint; BEGIN
  SELECT count(*) INTO istasyon_sayisi FROM istasyon;
  SELECT count(*) INTO makine_sayisi FROM makine;
  RAISE NOTICE 'istasyon: %, makine: % satır; hiçbiri değişmez, üç yeni tablo boş başlar', istasyon_sayisi, makine_sayisi;
END $$;

-- Operatör ihtiyacı, makine çalışırken başında durması gereken kişi sayısıdır (yarım için 0,5, otomatik için 0).
CREATE TABLE istasyonlar_plan_ayari (
  -- Ayar istasyonun parçasıdır: kullanılmayan istasyon silinince ayarı da gider.
  istasyon_id int PRIMARY KEY REFERENCES istasyon ON DELETE CASCADE,
  verim_yuzde numeric(5, 2) NOT NULL CONSTRAINT istasyonlar_plan_ayari_verim CHECK (verim_yuzde > 0 AND verim_yuzde <= 200),
  operator_ihtiyaci numeric(4, 2) NOT NULL CONSTRAINT istasyonlar_plan_ayari_operator CHECK (operator_ihtiyaci >= 0 AND operator_ihtiyaci <= 10),
  degistiren_kisi_id int NOT NULL REFERENCES kisi,
  degisme timestamptz NOT NULL DEFAULT now(),
  surum integer NOT NULL DEFAULT 1
);

-- Makinenin bugünkü hâli, geçmiş değil. Pasif (kullanım dışı) ayrı kalır: makine.aktif.
CREATE TABLE istasyonlar_makine_durumu (
  makine_id int PRIMARY KEY REFERENCES makine ON DELETE CASCADE,
  durum text NOT NULL CONSTRAINT istasyonlar_makine_durumu_degeri CHECK (durum IN ('calisir', 'ariza', 'bakim')),
  aciklama text CONSTRAINT istasyonlar_makine_durumu_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND char_length(aciklama) <= 200)),
  degistiren_kisi_id int NOT NULL REFERENCES kisi,
  degisme timestamptz NOT NULL DEFAULT now(),
  surum integer NOT NULL DEFAULT 1
);

-- Yetkinlik atamadan ayrıdır: atama kişinin nerede ve yüzde kaçla çalıştığıdır, yetkinlik nerede çalışabildiğidir (S3: yetkinliği olmayan istasyona atama uyarı verir, reddedilmez).
CREATE TABLE istasyonlar_yetkinlik (
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL REFERENCES istasyon ON DELETE CASCADE,
  CONSTRAINT istasyonlar_yetkinlik_pk PRIMARY KEY (kisi_id, istasyon_id)
);
