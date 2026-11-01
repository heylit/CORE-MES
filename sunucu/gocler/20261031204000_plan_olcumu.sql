-- Plan ölçüm kaydı (kart #1470, kullanıcı kararı 1470 a): her canlıya almada planın göstergeleri ve emir başına tahmini bitiş yazılır.
-- Kayma geçmişi ve plan tutarlılığı sonradan üretilemez; Plan Sağlığı sayfası bu iki tablodan okur. Yalnız ekleme: satır değişmez, silinmez.
-- Tablolar boş başlar.
CREATE TABLE plan_olcumu (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_surumu int NOT NULL,
  senaryo_id int NOT NULL CONSTRAINT plan_olcumu_senaryo REFERENCES plan_senaryosu,
  yazan_kisi_id int NOT NULL CONSTRAINT plan_olcumu_yazan REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  -- Planlı ve başlamış iş emri; yerleşmeyen bunlardan canlı planda yeri olmayan.
  toplam_is int NOT NULL CONSTRAINT plan_olcumu_toplam_is CHECK (toplam_is >= 0),
  yerlesmeyen_is int NOT NULL CONSTRAINT plan_olcumu_yerlesmeyen_is CHECK (yerlesmeyen_is BETWEEN 0 AND toplam_is),
  -- Üretim emri düzeyi (sipariş değil): plan göstergesindeki geciken ve zamanında yüzdesi; terminli emir yoksa yüzde boş.
  geciken_emir int NOT NULL CONSTRAINT plan_olcumu_geciken_emir CHECK (geciken_emir >= 0),
  zamaninda_yuzde smallint CONSTRAINT plan_olcumu_zamaninda_yuzde CHECK (zamaninda_yuzde BETWEEN 0 AND 100),
  agirlikli_gecikme_saat numeric(12,1) NOT NULL CONSTRAINT plan_olcumu_agirlikli_gecikme CHECK (agirlikli_gecikme_saat >= 0),
  -- Canlıya almadan önceki canlıya göre, bu canlıya almada geçen işler: tezgâhı değişen ya da başlangıcı 8 saatten çok kayan; yakın olan
  -- eski başlangıcı 72 saat içinde olandır. Yeni: önce canlıda yeri olmayan.
  degisen_is int NOT NULL CONSTRAINT plan_olcumu_degisen_is CHECK (degisen_is >= 0),
  yakin_degisen_is int NOT NULL CONSTRAINT plan_olcumu_yakin_degisen_is CHECK (yakin_degisen_is BETWEEN 0 AND degisen_is),
  yeni_is int NOT NULL CONSTRAINT plan_olcumu_yeni_is CHECK (yeni_is >= 0),
  -- Vardiyasız tezgâhta olduğu için canlıya geçmeyen iş; sipariş satırı ya da tutarı olmayan emir.
  vardiyasiz_is int NOT NULL CONSTRAINT plan_olcumu_vardiyasiz_is CHECK (vardiyasiz_is >= 0),
  gelirsiz_emir int NOT NULL CONSTRAINT plan_olcumu_gelirsiz_emir CHECK (gelirsiz_emir >= 0)
);
CREATE INDEX plan_olcumu_zaman_idx ON plan_olcumu (zaman, id);
CREATE INDEX plan_olcumu_senaryo_idx ON plan_olcumu (senaryo_id);
CREATE INDEX plan_olcumu_yazan_idx ON plan_olcumu (yazan_kisi_id);

-- Emrin o canlıya almadaki tahmini bitişi: planlı işlerinden biri yerleşmemişse boş. Emre yabancı anahtar yok: emir silinse de ölçüm kalır.
CREATE TABLE plan_olcumu_emri (
  olcum_id bigint NOT NULL CONSTRAINT plan_olcumu_emri_olcum REFERENCES plan_olcumu,
  uretim_emri_id int NOT NULL,
  tahmini_bitis timestamptz,
  termin date,
  PRIMARY KEY (olcum_id, uretim_emri_id)
);
CREATE INDEX plan_olcumu_emri_emir_idx ON plan_olcumu_emri (uretim_emri_id, olcum_id);

CREATE TRIGGER plan_olcumu_degismez BEFORE UPDATE OR DELETE ON plan_olcumu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_olcumu_bosaltilmaz BEFORE TRUNCATE ON plan_olcumu
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_olcumu_emri_degismez BEFORE UPDATE OR DELETE ON plan_olcumu_emri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_olcumu_emri_bosaltilmaz BEFORE TRUNCATE ON plan_olcumu_emri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
