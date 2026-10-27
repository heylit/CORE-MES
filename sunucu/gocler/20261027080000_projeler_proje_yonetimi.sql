-- Proje yönetimi (890 c; kullanıcı kararları 906 a prototip, 907 a ayrı statü tablosu, 909 a görev projelerde, 911 b görev tutarı finansta).
-- Hepsi yeni tablodur; projeler_proje değişmez. Yaşam durumu (aktif, tamamlandı, iptal) olduğu gibi kalır; statü ondan ayrı bir etikettir.

-- Seçilebilir statüler. Silinmez, etkinliği kapatılır: eski kayıtlar adıyla kalır.
CREATE TABLE projeler_statu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT projeler_statu_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 80),
  ton text NOT NULL CONSTRAINT projeler_statu_ton CHECK (ton IN ('tamam', 'uyari', 'hata', 'pasif', 'bilgi', 'vurgu')),
  sira int NOT NULL CONSTRAINT projeler_statu_sira_negatif_degil CHECK (sira >= 0),
  etkin boolean NOT NULL DEFAULT true,
  olusturan_id int NOT NULL CONSTRAINT projeler_statu_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT projeler_statu_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_statu_surum_pozitif CHECK (surum >= 1)
);
CREATE UNIQUE INDEX projeler_statu_ad_tekil ON projeler_statu (lower(ad));

-- Statü geçmişi: projenin güncel statüsü son kaydıdır. Ya listeden bir statü ya da elle yazılmış metin taşır, ikisi birden değil.
CREATE TABLE projeler_statu_kaydi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT projeler_statu_kaydi_proje REFERENCES projeler_proje (id),
  statu_id int CONSTRAINT projeler_statu_kaydi_statu REFERENCES projeler_statu (id),
  serbest_metin text CONSTRAINT projeler_statu_kaydi_metin_bicim CHECK (btrim(serbest_metin) = serbest_metin AND length(serbest_metin) BETWEEN 1 AND 80),
  notu text CONSTRAINT projeler_statu_kaydi_not_bicim CHECK (btrim(notu) = notu AND length(notu) BETWEEN 1 AND 500),
  kisi_id int NOT NULL CONSTRAINT projeler_statu_kaydi_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projeler_statu_kaydi_tek_kaynak CHECK ((statu_id IS NULL) <> (serbest_metin IS NULL))
);
CREATE INDEX projeler_statu_kaydi_proje_idx ON projeler_statu_kaydi (proje_id, id DESC);
CREATE TRIGGER projeler_statu_kaydi_degismez BEFORE UPDATE OR DELETE ON projeler_statu_kaydi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_statu_kaydi_bosaltilmaz BEFORE TRUNCATE ON projeler_statu_kaydi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Modül ayarı, tek satır: listede olmayan statünün elle yazılmasına izin.
CREATE TABLE projeler_ayar (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT projeler_ayar_tek_satir CHECK (id),
  serbest_statu boolean NOT NULL DEFAULT true,
  guncelleyen_id int CONSTRAINT projeler_ayar_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_ayar_surum_pozitif CHECK (surum >= 1)
);
INSERT INTO projeler_ayar (id) VALUES (true);

-- Kilometre taşı. Taban tarih yazılınca donar; yalnız gerekçeli "taban yenile" komutu değiştirir ve geçmişe yazar.
CREATE TABLE projeler_kilometre_tasi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT projeler_kilometre_tasi_proje REFERENCES projeler_proje (id),
  ad text NOT NULL CONSTRAINT projeler_kilometre_tasi_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 200),
  sira int NOT NULL CONSTRAINT projeler_kilometre_tasi_sira_negatif_degil CHECK (sira >= 0),
  taban_tarih date NOT NULL,
  gercek_tarih date,
  etkin boolean NOT NULL DEFAULT true,
  olusturan_id int NOT NULL CONSTRAINT projeler_kilometre_tasi_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT projeler_kilometre_tasi_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_kilometre_tasi_surum_pozitif CHECK (surum >= 1),
  -- Görevin kilometre taşı aynı projeden olmalı: görev bu çifte bağlanır.
  CONSTRAINT projeler_kilometre_tasi_proje_cifti UNIQUE (id, proje_id)
);
CREATE INDEX projeler_kilometre_tasi_proje_idx ON projeler_kilometre_tasi (proje_id, sira, id);

CREATE TABLE projeler_kilometre_tasi_taban (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kilometre_tasi_id int NOT NULL CONSTRAINT projeler_kilometre_tasi_taban_tas REFERENCES projeler_kilometre_tasi (id),
  eski_tarih date NOT NULL,
  yeni_tarih date NOT NULL,
  gerekce text NOT NULL CONSTRAINT projeler_kilometre_tasi_taban_gerekce_bicim CHECK (btrim(gerekce) = gerekce AND length(gerekce) BETWEEN 1 AND 500),
  kisi_id int NOT NULL CONSTRAINT projeler_kilometre_tasi_taban_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projeler_kilometre_tasi_taban_tas_idx ON projeler_kilometre_tasi_taban (kilometre_tasi_id, id);
CREATE TRIGGER projeler_kilometre_tasi_taban_degismez BEFORE UPDATE OR DELETE ON projeler_kilometre_tasi_taban
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER projeler_kilometre_tasi_taban_bosaltilmaz BEFORE TRUNCATE ON projeler_kilometre_tasi_taban
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Taban tarih yalnız geçmiş satırıyla birlikte değişir: aynı transaction'da geçmişe yazılmamış değişiklik reddedilir.
CREATE FUNCTION projeler_kilometre_tasi_taban_korumasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.taban_tarih IS DISTINCT FROM OLD.taban_tarih AND NOT EXISTS (
    SELECT 1 FROM projeler_kilometre_tasi_taban t
     WHERE t.kilometre_tasi_id = NEW.id AND t.eski_tarih = OLD.taban_tarih AND t.yeni_tarih = NEW.taban_tarih
       AND t.an = now()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_kilometre_tasi_taban_donuk',
      MESSAGE = 'Taban tarih yalnız gerekçeyle yenilenir.';
  END IF;
  IF NEW.proje_id IS DISTINCT FROM OLD.proje_id OR NEW.olusturan_id IS DISTINCT FROM OLD.olusturan_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_kilometre_tasi_acilis_degismez',
      MESSAGE = 'Kilometre taşının projesi ve açılışı değişmez.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projeler_kilometre_tasi_taban_korumasi BEFORE UPDATE ON projeler_kilometre_tasi
  FOR EACH ROW EXECUTE FUNCTION projeler_kilometre_tasi_taban_korumasi();

-- Görev. Tutar tutmaz (911 b): üretim dışı gider finansta masraf belgesine proje bağıyla girer. Silinmez, "iptal" olur.
CREATE TABLE projeler_gorev (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proje_id int NOT NULL CONSTRAINT projeler_gorev_proje REFERENCES projeler_proje (id),
  kilometre_tasi_id int,
  ad text NOT NULL CONSTRAINT projeler_gorev_ad_bicim CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 200),
  aciklama text CONSTRAINT projeler_gorev_aciklama_bicim CHECK (btrim(aciklama) = aciklama AND length(aciklama) BETWEEN 1 AND 1000),
  sorumlu_kisi_id int CONSTRAINT projeler_gorev_sorumlu REFERENCES kisi (id),
  plan_baslangic date NOT NULL,
  plan_bitis date NOT NULL,
  gercek_baslangic date,
  gercek_bitis date,
  ilerleme int NOT NULL DEFAULT 0 CONSTRAINT projeler_gorev_ilerleme_araligi CHECK (ilerleme BETWEEN 0 AND 100),
  durum text NOT NULL DEFAULT 'yapilacak' CONSTRAINT projeler_gorev_durum CHECK (durum IN ('yapilacak', 'suruyor', 'bekliyor', 'bitti', 'iptal')),
  onceki_gorev_id int,
  olusturan_id int NOT NULL CONSTRAINT projeler_gorev_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT projeler_gorev_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT projeler_gorev_surum_pozitif CHECK (surum >= 1),
  CONSTRAINT projeler_gorev_proje_cifti UNIQUE (id, proje_id),
  CONSTRAINT projeler_gorev_kilometre_tasi FOREIGN KEY (kilometre_tasi_id, proje_id) REFERENCES projeler_kilometre_tasi (id, proje_id),
  CONSTRAINT projeler_gorev_onceki FOREIGN KEY (onceki_gorev_id, proje_id) REFERENCES projeler_gorev (id, proje_id),
  CONSTRAINT projeler_gorev_onceki_kendisi_degil CHECK (onceki_gorev_id IS NULL OR onceki_gorev_id <> id),
  CONSTRAINT projeler_gorev_plan_sirasi CHECK (plan_bitis >= plan_baslangic),
  CONSTRAINT projeler_gorev_gercek_sirasi CHECK (gercek_bitis IS NULL OR (gercek_baslangic IS NOT NULL AND gercek_bitis >= gercek_baslangic)),
  CONSTRAINT projeler_gorev_bitti_butun CHECK (durum <> 'bitti' OR (gercek_bitis IS NOT NULL AND ilerleme = 100))
);
CREATE INDEX projeler_gorev_proje_idx ON projeler_gorev (proje_id, plan_baslangic, id);

CREATE FUNCTION projeler_gorev_degismezler() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proje_id IS DISTINCT FROM OLD.proje_id OR NEW.olusturan_id IS DISTINCT FROM OLD.olusturan_id OR NEW.olusturma IS DISTINCT FROM OLD.olusturma THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'projeler_gorev_acilis_degismez',
      MESSAGE = 'Görevin projesi ve açılışı değişmez.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projeler_gorev_degismezler BEFORE UPDATE ON projeler_gorev
  FOR EACH ROW EXECUTE FUNCTION projeler_gorev_degismezler();
