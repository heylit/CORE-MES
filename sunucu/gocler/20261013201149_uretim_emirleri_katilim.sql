-- Aynı işe birden çok kişi katılır (kart #1144): her satır bir kişinin o işte kesintisiz çalıştığı aralıktır. Kişi kendi
-- aralığını açar (katıl), kapatır (duraklat ya da ayrıl); emrin duraklatılması, durdurulması ve bitmesi açık aralıkları kapatır.
-- Sayım kişiye ve iş emrine zaten bağlıdır (uretim_sayimi.kisi_id, is_emri_id); var olan tablolar değişmez.
CREATE TABLE uretim_emirleri_katilim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  is_emri_id int REFERENCES uretim_emirleri_is_emri,
  kisi_id int NOT NULL REFERENCES kisi,
  istasyon_id int NOT NULL REFERENCES istasyon,
  giris timestamptz NOT NULL,
  cikis timestamptz,
  -- Aralığın neden kapandığı: kişi duraklattı, kişi ayrıldı ya da emir durdu/bitti.
  kapanis text CONSTRAINT uretim_emirleri_katilim_kapanis_degeri CHECK (kapanis IN ('duraklat', 'ayril', 'emir')),
  CONSTRAINT uretim_emirleri_katilim_kapanis_butun CHECK ((cikis IS NULL) = (kapanis IS NULL)),
  CONSTRAINT uretim_emirleri_katilim_sira CHECK (cikis IS NULL OR cikis >= giris)
);
CREATE UNIQUE INDEX uretim_emirleri_katilim_kiside_tek_acik ON uretim_emirleri_katilim (emir_id, kisi_id) WHERE cikis IS NULL;
CREATE INDEX uretim_emirleri_katilim_emir_idx ON uretim_emirleri_katilim (emir_id, id);
CREATE INDEX uretim_emirleri_katilim_kisi_idx ON uretim_emirleri_katilim (kisi_id, giris);
