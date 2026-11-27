-- Heidenhain program listesi (kart 3790): seyrek okumada oturumun açılış klasöründen okunan dosyaların yalnız adı, boyutu ve tarihi
-- (içerik okunmaz), ve okunamadıysa nedeni. Yeni boş tablo ve boş olabilen sütun; veri silmez.
CREATE TABLE tezgah_lsv2_program (
  cihaz_adi text NOT NULL CONSTRAINT tezgah_lsv2_program_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  ad text NOT NULL CONSTRAINT tezgah_lsv2_program_ad CHECK (btrim(ad) <> '' AND length(ad) <= 255),
  boyut bigint NOT NULL CONSTRAINT tezgah_lsv2_program_boyut CHECK (boyut >= 0),
  tarih timestamptz,
  okundu timestamptz NOT NULL,
  PRIMARY KEY (cihaz_adi, ad)
);

ALTER TABLE tezgah_lsv2_seyrek ADD COLUMN program_tani text CONSTRAINT tezgah_lsv2_seyrek_program_tani CHECK (length(program_tani) <= 200);
