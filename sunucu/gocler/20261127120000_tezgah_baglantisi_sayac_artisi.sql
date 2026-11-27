-- Tezgâh deneme sayfası (kart 3811-2): sayaç değişimleri bağlamıyla ve Heidenhain program dosyası sürümleri. İkisi de yalnız bu modülün
-- gölge hesabı içindir; başka modüle yazılmaz. Yeni boş tablolar; başka tabloya dokunmaz.

-- Tezgâh sayacının her değişimi (artış ya da geri gidiş) o anki program, kip, Dryrun ve Singleblock ile. Cihazın ilk okumasında taban
-- satırı (onceki boş) yazılır. Üretim sayılıp sayılmadığı okurken kuraldan hesaplanır (kip otomatik, Dryrun ve Singleblock kapalı).
-- 90 günden eski satırı okuma turunun temizliği siler.
CREATE TABLE tezgah_sayac_artisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_sayac_artisi_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  zaman timestamptz NOT NULL,
  onceki bigint,
  deger bigint NOT NULL,
  program text CONSTRAINT tezgah_sayac_artisi_program CHECK (length(program) <= 500),
  kip text CONSTRAINT tezgah_sayac_artisi_kip CHECK (length(kip) <= 60),
  dryrun boolean,
  singleblock boolean
);
CREATE INDEX tezgah_sayac_artisi_zaman ON tezgah_sayac_artisi (cihaz_adi, zaman, id);

-- Heidenhain program listesinde bir dosyanın görülen her (boyut, tarih) sürümü ve ilk görüldüğü an. İşin onaylı program bilgisi, işin
-- programla ilk eşleştiği gündeki sürümdür; sonra başka sürüm görülürse "program değişti" işareti çıkar. İçerik okunmaz.
CREATE TABLE tezgah_program_surumu (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_program_surumu_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  ad text NOT NULL CONSTRAINT tezgah_program_surumu_ad CHECK (btrim(ad) <> '' AND length(ad) <= 255),
  boyut bigint NOT NULL CONSTRAINT tezgah_program_surumu_boyut CHECK (boyut >= 0),
  tarih timestamptz,
  ilk_goruldu timestamptz NOT NULL
);
CREATE UNIQUE INDEX tezgah_program_surumu_tek ON tezgah_program_surumu (cihaz_adi, ad, boyut, tarih) NULLS NOT DISTINCT;
