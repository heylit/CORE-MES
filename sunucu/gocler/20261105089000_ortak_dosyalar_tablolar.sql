-- Ortak Dosyalar (kart 2067, ADR 0030): klasör ağacı, klasör x rol düzeyi, sürümlü dosya. Yalnız yeni, boş tablolar açılır.
-- İçerik `dosya` modülündedir; her sürüm dosya_bagi'na (modul 'ortak-dosyalar', kayit = sürüm kimliği) bağlanır (ADR 0009).
-- Ad anahtarı adın tr-TR küçük harfidir ve sunucuda kurallar.ts'te üretilir: PostgreSQL lower() I/ı ayrımını kurumun
-- harmanlamasına bıraktığı için tekillik ona yaslanmaz.

CREATE TABLE ortak_dosyalar_klasor (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ust_id int CONSTRAINT ortak_dosyalar_klasor_ust_fk REFERENCES ortak_dosyalar_klasor,
  ad text NOT NULL CONSTRAINT ortak_dosyalar_klasor_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND char_length(ad) <= 120),
  ad_anahtari text NOT NULL CONSTRAINT ortak_dosyalar_klasor_anahtar_bicimi CHECK (ad_anahtari <> '' AND char_length(ad_anahtari) <= 120),
  -- Üst düzey klasör yetkisini kendisi taşır (ADR 0030, 4).
  ozel_yetki boolean NOT NULL,
  surum int NOT NULL DEFAULT 1,
  olusturan_kisi_id int NOT NULL CONSTRAINT ortak_dosyalar_klasor_olusturan_fk REFERENCES kisi,
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  yetki_degistiren_kisi_id int CONSTRAINT ortak_dosyalar_klasor_yetki_degistiren_fk REFERENCES kisi,
  yetki_degisme_zamani timestamptz,
  CONSTRAINT ortak_dosyalar_klasor_kok_ozel CHECK (ust_id IS NOT NULL OR ozel_yetki),
  CONSTRAINT ortak_dosyalar_klasor_kendine_bagli_degil CHECK (ust_id IS NULL OR ust_id <> id),
  CONSTRAINT ortak_dosyalar_klasor_yetki_izi_butun CHECK ((yetki_degistiren_kisi_id IS NULL) = (yetki_degisme_zamani IS NULL))
);
-- Aynı ebeveynde aynı adlı iki klasör olamaz (ADR 0030, 7); kökler 0 altında sayılır.
CREATE UNIQUE INDEX ortak_dosyalar_klasor_ad_tekil ON ortak_dosyalar_klasor (COALESCE(ust_id, 0), ad_anahtari);

-- Klasör x rol düzeyi; satırı olmayan rol `yok`tur. Rol silinirse satırı da gider.
CREATE TABLE ortak_dosyalar_yetki (
  klasor_id int NOT NULL CONSTRAINT ortak_dosyalar_yetki_klasor_fk REFERENCES ortak_dosyalar_klasor ON DELETE CASCADE,
  rol_id int NOT NULL CONSTRAINT ortak_dosyalar_yetki_rol_fk REFERENCES rol ON DELETE CASCADE,
  duzey text NOT NULL CONSTRAINT ortak_dosyalar_yetki_duzey_degeri CHECK (duzey IN ('gorur', 'ekler', 'yonetir')),
  PRIMARY KEY (klasor_id, rol_id)
);
CREATE INDEX ortak_dosyalar_yetki_rol ON ortak_dosyalar_yetki (rol_id);

CREATE TABLE ortak_dosyalar_dosya (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  klasor_id int NOT NULL CONSTRAINT ortak_dosyalar_dosya_klasor_fk REFERENCES ortak_dosyalar_klasor,
  ad text NOT NULL CONSTRAINT ortak_dosyalar_dosya_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND char_length(ad) <= 120),
  ad_anahtari text NOT NULL CONSTRAINT ortak_dosyalar_dosya_anahtar_bicimi CHECK (ad_anahtari <> '' AND char_length(ad_anahtari) <= 120),
  -- Silme yok (ADR 0030, 6): arşivdeki dosya listelenmez, indirilmez, geri alınır.
  arsiv boolean NOT NULL DEFAULT false,
  arsiv_kisi_id int CONSTRAINT ortak_dosyalar_dosya_arsiv_kisi_fk REFERENCES kisi,
  arsiv_zamani timestamptz,
  geri_alan_kisi_id int CONSTRAINT ortak_dosyalar_dosya_geri_alan_fk REFERENCES kisi,
  geri_alma_zamani timestamptz,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT ortak_dosyalar_dosya_arsiv_izi CHECK ((arsiv_kisi_id IS NULL) = (arsiv_zamani IS NULL) AND (NOT arsiv OR arsiv_zamani IS NOT NULL)),
  CONSTRAINT ortak_dosyalar_dosya_geri_alma_izi CHECK ((geri_alan_kisi_id IS NULL) = (geri_alma_zamani IS NULL))
);
-- Klasörde aynı adlı iki etkin dosya olamaz; arşivdekiler sayılmaz.
CREATE UNIQUE INDEX ortak_dosyalar_dosya_ad_tekil ON ortak_dosyalar_dosya (klasor_id, ad_anahtari) WHERE NOT arsiv;
CREATE INDEX ortak_dosyalar_dosya_klasor ON ortak_dosyalar_dosya (klasor_id);

-- Eski sürüm değişmez (ADR 0030, 7); sıra dosya içinde 1'den artar.
CREATE TABLE ortak_dosyalar_surum (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dosya_id int NOT NULL CONSTRAINT ortak_dosyalar_surum_dosya_fk REFERENCES ortak_dosyalar_dosya,
  sira int NOT NULL CONSTRAINT ortak_dosyalar_surum_sira_pozitif CHECK (sira > 0),
  ozet text NOT NULL CONSTRAINT ortak_dosyalar_surum_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  boyut bigint NOT NULL CONSTRAINT ortak_dosyalar_surum_boyut CHECK (boyut >= 0),
  yukleyen_kisi_id int NOT NULL CONSTRAINT ortak_dosyalar_surum_yukleyen_fk REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ortak_dosyalar_surum_sira_tekil UNIQUE (dosya_id, sira)
);
CREATE INDEX ortak_dosyalar_surum_zaman ON ortak_dosyalar_surum (zaman DESC);
