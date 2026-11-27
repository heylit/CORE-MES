-- Heidenhain takım tablosu (kart 3790): seyrek okumada (Sistem Ayarları, varsayılan kapalı) LSV2 ile okunan TOOL.T'nin son durumu ve
-- yalnız ömür ya da kilit değişikliği geçmişi. Yeni boş tablolar; veri silmez, var olan tabloya dokunmaz.
CREATE TABLE tezgah_lsv2_takim (
  cihaz_adi text NOT NULL CONSTRAINT tezgah_lsv2_takim_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  takim_no integer NOT NULL,
  ad text CONSTRAINT tezgah_lsv2_takim_ad CHECK (length(ad) <= 100),
  boy double precision,
  yaricap double precision,
  -- Dakika: ömür sınırı (TIME1) ve kullanılan süre (CUR_TIME).
  omur double precision,
  kullanilan double precision,
  kilitli boolean,
  okundu timestamptz NOT NULL,
  PRIMARY KEY (cihaz_adi, takim_no)
);

CREATE TABLE tezgah_lsv2_takim_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_lsv2_takim_gecmisi_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  takim_no integer NOT NULL,
  zaman timestamptz NOT NULL,
  omur double precision,
  kullanilan double precision,
  kilitli boolean
);
CREATE INDEX tezgah_lsv2_takim_gecmisi_cihaz_zaman ON tezgah_lsv2_takim_gecmisi (cihaz_adi, zaman DESC);

-- Son seyrek okumanın zamanı ve sonucu (makine başına): ekran "en son ne zaman okundu, neden okunamadı" der.
CREATE TABLE tezgah_lsv2_seyrek (
  cihaz_adi text PRIMARY KEY CONSTRAINT tezgah_lsv2_seyrek_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  okundu timestamptz NOT NULL,
  takim_tani text CONSTRAINT tezgah_lsv2_seyrek_takim_tani CHECK (length(takim_tani) <= 200)
);
