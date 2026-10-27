-- Üretim anomalisi zaman olayları (kart 764): geç giriş, geç teslim, sonraki işe etki, teslim riski, toplu giriş tutarsızlığı ve plan sapması.
-- Canlı plan yeniden yayınlanınca geciken işin plan anı da kayar; olay tespit anındaki plan anını dondurur, sürerken dakikası güncellenir,
-- iş başlayınca ya da girdi gelince kapanır. Yalnız yeni, boş bir tablo açılır; var olan tablo değişmez.
CREATE TABLE arkon_anomali_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT arkon_anomali_olayi_tur_degeri
    CHECK (tur IN ('gec-giris', 'gec-teslim', 'ardil-etkisi', 'teslim-riski', 'toplu-tutarsiz', 'bitis-kaymasi', 'sure-asimi')),
  -- Olay kayıtları başka modülün tanımı silinse de kalır: yabancı anahtar yoktur (arkon_anomali_satiri ile aynı).
  is_emri_id int NOT NULL,
  uretim_emri_id int,
  -- Tespit anındaki emir numarası ve adım: iş bitip plandan düşse de olay okunur kalır.
  emir_no text,
  op_no int,
  -- Veri kapsamı bununla süzülür; çözülemezse boş.
  istasyon_id int,
  kaynak_tur text CONSTRAINT arkon_anomali_olayi_kaynak_degeri CHECK (kaynak_tur IN ('makine', 'kisi')),
  kaynak_id int,
  -- Yalnız toplu giriş tutarsızlığında: uyarıyı doğuran sayım kaydı (arkon_kayit budanabildiği için bağ yoktur).
  kayit_id bigint,
  -- Tespit anındaki canlı plan sürümü ve anı; olay açıkken değişmez.
  plan_surumu int,
  plan_ani timestamptz,
  -- Sabit taban plandaki an ve ona göre dakika: yalnız rapor, işaret değil.
  taban_ani timestamptz,
  taban_dakika numeric,
  -- Gerçekleşen an (giriş, girdinin gelişi); sürüyorsa boş.
  gercek_ani timestamptz,
  -- Net aktif dakika (vardiya dışı ve mola sayılmaz); teslim riskinde takvim dakikası.
  dakika numeric NOT NULL CONSTRAINT arkon_anomali_olayi_dakika_eksi_degil CHECK (dakika >= 0),
  -- Sonraki işe etki ve teslim riskinde etkiyi doğuran olay.
  kok_olay_id bigint CONSTRAINT arkon_anomali_olayi_kok_var REFERENCES arkon_anomali_olayi (id),
  acilis timestamptz NOT NULL,
  guncelleme timestamptz NOT NULL,
  kapanis timestamptz,
  -- Bildirimin gittiği an; gitmediyse boş.
  bildirim timestamptz,
  CONSTRAINT arkon_anomali_olayi_tekil UNIQUE NULLS NOT DISTINCT (tur, is_emri_id, kayit_id),
  CONSTRAINT arkon_anomali_olayi_kaynak_tutarli CHECK ((kaynak_tur IS NULL) = (kaynak_id IS NULL)),
  CONSTRAINT arkon_anomali_olayi_kayit_yalniz_toplu CHECK ((tur = 'toplu-tutarsiz') = (kayit_id IS NOT NULL)),
  CONSTRAINT arkon_anomali_olayi_kapanis_sirali CHECK (kapanis IS NULL OR kapanis >= acilis)
);

CREATE INDEX arkon_anomali_olayi_acik ON arkon_anomali_olayi (tur) WHERE kapanis IS NULL;
CREATE INDEX arkon_anomali_olayi_acilis ON arkon_anomali_olayi (acilis);
