-- Takım ömrü (karar 295 a, kapsam /inceleme/takim-omru/kapsam.md). Prototip ömrü tarayıcıda tutar ve sayacı elle artırır;
-- sunucu cebin yükünü kurulum tamamlanınca prototip durumundan çıkarır, kullanımı üretim sayımından yazar.
-- Tezgâh TMI istasyonudur: prototipin tezgâh kütüphanesi TMI makinesine bağlı değil, kurulum iş emrinin istasyonuna yapılır.
-- İstasyon, kişi ve emir sütunları Aşama 2'de yabancı anahtarla bağlanır.
CREATE TABLE cnc_kurulum_takim_yuku (
  istasyon_id int NOT NULL,
  cep smallint NOT NULL,
  takim_kimligi text NOT NULL,
  takim_ad text NOT NULL,
  -- Programdan gelen parça başı kesme süresi (dakika); program açılmadıysa yalnız adet sayılır.
  parca_basi_dk numeric(12, 4),
  omur_dk numeric(12, 2),
  omur_adet integer,
  guncelleyen_kisi_id int NOT NULL,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (istasyon_id, cep),
  CONSTRAINT cnc_kurulum_takim_yuku_cep CHECK (cep BETWEEN 0 AND 999),
  CONSTRAINT cnc_kurulum_takim_yuku_kimlik CHECK (length(takim_kimligi) BETWEEN 1 AND 200),
  CONSTRAINT cnc_kurulum_takim_yuku_ad CHECK (length(takim_ad) <= 200),
  CONSTRAINT cnc_kurulum_takim_yuku_sure CHECK (parca_basi_dk IS NULL OR parca_basi_dk >= 0),
  CONSTRAINT cnc_kurulum_takim_yuku_omur CHECK ((omur_dk IS NULL OR omur_dk > 0) AND (omur_adet IS NULL OR omur_adet > 0))
);

-- Kullanım defteri: yalnız eklenir. Cebin kullanımı, o takım için son değişimden sonraki olayların toplamıdır.
CREATE TABLE cnc_kurulum_takim_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  istasyon_id int NOT NULL,
  cep smallint NOT NULL,
  takim_kimligi text NOT NULL,
  tur text NOT NULL,
  dk numeric(14, 4) NOT NULL DEFAULT 0,
  adet numeric(14, 3) NOT NULL DEFAULT 0,
  uretim_emri_id int,
  is_emri_id int,
  neden text,
  kisi_id int NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnc_kurulum_takim_olayi_tur CHECK (tur IN ('sayim', 'degisim', 'duzeltme')),
  CONSTRAINT cnc_kurulum_takim_olayi_neden CHECK (neden IS NULL OR length(neden) <= 500)
);

CREATE INDEX cnc_kurulum_takim_olayi_cep_idx ON cnc_kurulum_takim_olayi (istasyon_id, cep, takim_kimligi, id);

CREATE TRIGGER cnc_kurulum_takim_olayi_degismez BEFORE UPDATE OR DELETE ON cnc_kurulum_takim_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER cnc_kurulum_takim_olayi_bosaltilmaz BEFORE TRUNCATE ON cnc_kurulum_takim_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
