-- 3572 a (dilim 1): kartta elle tanımlanan alternatifler. Alternatif seti nitelik demetidir (alanda veya, alanlar arası ve); sete uyan
-- her aktif kart kabul edilir. Seçili alternatif tek tek eklenen kart ya da "Önerilmesin" işaretidir. Yalnız ekleyen göç; kabul sınırı,
-- kural, muadil ve eşdeğer tabloları değişmez.

CREATE TABLE malzeme_alternatif_seti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ana_no int NOT NULL CONSTRAINT malzeme_alternatif_seti_ana REFERENCES malzeme_katalog_karti (no),
  ad text NOT NULL CONSTRAINT malzeme_alternatif_seti_ad CHECK (btrim(ad) = ad AND ad <> '' AND length(ad) <= 80),
  tur text NOT NULL CONSTRAINT malzeme_alternatif_seti_tur CHECK (tur IN ('tam', 'ust', 'sartli')),
  sira int NOT NULL CONSTRAINT malzeme_alternatif_seti_sira CHECK (sira >= 0),
  kullanim_yerleri text[] NOT NULL CONSTRAINT malzeme_alternatif_seti_yerler
    CHECK (cardinality(kullanim_yerleri) BETWEEN 1 AND 3 AND kullanim_yerleri <@ ARRAY['talep', 'satin_alma', 'uretim']),
  notu text CONSTRAINT malzeme_alternatif_seti_notu CHECK (notu IS NULL OR (btrim(notu) = notu AND notu <> '' AND length(notu) <= 300)),
  -- K5: kayıtta ya da katalog değişince sayılan uyan kart; değişimi değişiklik defterine düşer. Geniş set (eşik üstü) işaretle kaydedilir.
  uyan_sayi int NOT NULL DEFAULT 0 CONSTRAINT malzeme_alternatif_seti_uyan CHECK (uyan_sayi >= 0),
  genis_onay boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX malzeme_alternatif_seti_ana_dizini ON malzeme_alternatif_seti (ana_no, sira);

-- Nitelik başına tek satır. Liste niteliği (form, kalite, durum, standart, yüzey) izinli değerleri, ölçü niteliği mm cinsinden alt ve
-- üst sınırı taşır (boş uç sınırsız). Satırı olmayan nitelik serbesttir. ana_no setinkiyle aynıdır (bileşik yabancı anahtar); kartın
-- Geçmiş'i nitelik değişikliğini ana karta göre bulur.
ALTER TABLE malzeme_alternatif_seti ADD CONSTRAINT malzeme_alternatif_seti_ana_id UNIQUE (ana_no, id);
CREATE TABLE malzeme_alternatif_seti_niteligi (
  set_id int NOT NULL,
  ana_no int NOT NULL,
  nitelik text NOT NULL CONSTRAINT malzeme_alternatif_seti_niteligi_nitelik
    CHECK (nitelik IN ('form', 'kalite', 'durum', 'standart', 'yuzey', 'd', 's', 'a', 'b', 't', 'D', 'h', 'l')),
  degerler text[],
  alt numeric(10, 3) CONSTRAINT malzeme_alternatif_seti_niteligi_alt CHECK (alt >= 0 AND alt <= 100000),
  ust numeric(10, 3) CONSTRAINT malzeme_alternatif_seti_niteligi_ust CHECK (ust >= 0 AND ust <= 100000),
  PRIMARY KEY (set_id, nitelik),
  CONSTRAINT malzeme_alternatif_seti_niteligi_set FOREIGN KEY (ana_no, set_id) REFERENCES malzeme_alternatif_seti (ana_no, id) ON DELETE CASCADE,
  CONSTRAINT malzeme_alternatif_seti_niteligi_bicim CHECK (
    (nitelik IN ('form', 'kalite', 'durum', 'standart', 'yuzey') AND cardinality(degerler) BETWEEN 1 AND 40 AND alt IS NULL AND ust IS NULL)
    OR (nitelik NOT IN ('form', 'kalite', 'durum', 'standart', 'yuzey') AND degerler IS NULL AND (alt IS NOT NULL OR ust IS NOT NULL))),
  CONSTRAINT malzeme_alternatif_seti_niteligi_sira CHECK (alt IS NULL OR ust IS NULL OR alt <= ust)
);

-- Kartın tek tek seçilen alternatifi ya da "Önerilmesin" işareti (kart hiçbir yerde önerilmez ve kabul edilmez). Önerilmeyen satırda
-- tür ve yer yoktur, neden zorunludur.
CREATE TABLE malzeme_secili_alternatif (
  ana_no int NOT NULL CONSTRAINT malzeme_secili_alternatif_ana REFERENCES malzeme_katalog_karti (no),
  alternatif_no int NOT NULL CONSTRAINT malzeme_secili_alternatif_alternatif REFERENCES malzeme_katalog_karti (no),
  onerilmez boolean NOT NULL DEFAULT false,
  tur text CONSTRAINT malzeme_secili_alternatif_tur CHECK (tur IN ('tam', 'ust', 'sartli')),
  sira int CONSTRAINT malzeme_secili_alternatif_sira CHECK (sira >= 0),
  kullanim_yerleri text[] CONSTRAINT malzeme_secili_alternatif_yerler
    CHECK (cardinality(kullanim_yerleri) BETWEEN 1 AND 3 AND kullanim_yerleri <@ ARRAY['talep', 'satin_alma', 'uretim']),
  notu text CONSTRAINT malzeme_secili_alternatif_notu CHECK (notu IS NULL OR (btrim(notu) = notu AND notu <> '' AND length(notu) <= 300)),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ana_no, alternatif_no),
  CONSTRAINT malzeme_secili_alternatif_kendisi CHECK (ana_no <> alternatif_no),
  CONSTRAINT malzeme_secili_alternatif_bicim CHECK (
    (onerilmez AND tur IS NULL AND sira IS NULL AND kullanim_yerleri IS NULL AND notu IS NOT NULL)
    OR (NOT onerilmez AND tur IS NOT NULL AND sira IS NOT NULL AND kullanim_yerleri IS NOT NULL))
);

-- Kartın Geçmiş'i: değişiklik defteri ana karta göre süzülür (anahtar ana_no içerir). Ekleme de yazılır: satırın kendisi kayıttır ama
-- kaldırılan setin ne zaman eklendiği defterde kalmalı.
CREATE TRIGGER malzeme_alternatif_seti_degisiklik AFTER INSERT OR UPDATE OR DELETE ON malzeme_alternatif_seti
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('ana_no,id', 'surum', 'guncelleme', 'guncelleyen_kisi_id');
CREATE TRIGGER malzeme_alternatif_seti_niteligi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON malzeme_alternatif_seti_niteligi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('ana_no,set_id,nitelik');
CREATE TRIGGER malzeme_secili_alternatif_degisiklik AFTER INSERT OR UPDATE OR DELETE ON malzeme_secili_alternatif
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('ana_no,alternatif_no', 'surum', 'guncelleme', 'guncelleyen_kisi_id');
