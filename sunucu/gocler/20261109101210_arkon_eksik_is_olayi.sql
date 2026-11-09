-- Eksik iş olayları (kart 2421 c): plandan bağımsız olarak yapılması gereken ama yapılmayan, girilmeyen ya da geciken iş. Plan gerisi,
-- kayıtsız iş günü, yarım kalan iş, plana girmemiş açık iş, geciken emir ve bayat plan. Olay sürerken değeri güncellenir, giderilince
-- kapanır; kapanan olay iz olarak kalır, aynı konu yeniden eksik düşerse yeni satır açılır. Yalnız yeni, boş bir tablo açılır.
CREATE TABLE arkon_eksik_is_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT arkon_eksik_is_olayi_tur_degeri
    CHECK (tur IN ('plan-gerisi', 'kayitsiz-gun', 'yarim-is', 'plansiz-is', 'geciken-emir', 'bayat-plan')),
  -- Olayın konusu: iş emri (plan gerisi, yarım, plansız), istasyon (kayıtsız gün), üretim emri (geciken emir) ya da plan (bayat plan).
  konu_tur text NOT NULL CONSTRAINT arkon_eksik_is_olayi_konu_degeri CHECK (konu_tur IN ('is_emri', 'istasyon', 'uretim_emri', 'plan')),
  -- Konunun kimliği; plan için boş. Başka modülün kaydı silinse de olay kalır: yabancı anahtar yoktur (arkon_anomali_olayi ile aynı).
  konu_id int,
  is_emri_id int,
  uretim_emri_id int,
  -- Tespit anındaki emir numarası ve adım: iş bitip plandan düşse de olay okunur kalır.
  emir_no text,
  op_no int,
  -- Veri kapsamı bununla süzülür; çözülemezse boş.
  istasyon_id int,
  kaynak_tur text CONSTRAINT arkon_eksik_is_olayi_kaynak_degeri CHECK (kaynak_tur IN ('makine', 'kisi')),
  kaynak_id int,
  -- Birim türündedir: plan gerisi ve yarım iş net dakika ya da saat, kayıtsız gün iş günü, plansız iş ve bayat plan saat, geciken emir gün.
  deger numeric NOT NULL CONSTRAINT arkon_eksik_is_olayi_deger_eksi_degil CHECK (deger >= 0),
  kalan_adet int CONSTRAINT arkon_eksik_is_olayi_kalan_eksi_degil CHECK (kalan_adet >= 0),
  -- Geciken emirde teslim günü gelmedi ama plandaki bitiş teslimden sonra.
  plana_gore boolean NOT NULL DEFAULT false,
  -- Olaya bakılan an: plan bitişi, son hareket, son giriş, son canlıya alma ya da teslim günü sonu.
  dayanak_ani timestamptz,
  acilis timestamptz NOT NULL,
  guncelleme timestamptz NOT NULL,
  kapanis timestamptz,
  -- Bildirimin gittiği an; gitmediyse boş.
  bildirim timestamptz,
  CONSTRAINT arkon_eksik_is_olayi_kaynak_tutarli CHECK ((kaynak_tur IS NULL) = (kaynak_id IS NULL)),
  CONSTRAINT arkon_eksik_is_olayi_konu_kimligi CHECK ((konu_tur = 'plan') = (konu_id IS NULL)),
  CONSTRAINT arkon_eksik_is_olayi_kapanis_sirali CHECK (kapanis IS NULL OR kapanis >= acilis)
);

-- Konu başına tek açık olay.
CREATE UNIQUE INDEX arkon_eksik_is_olayi_acik_tekil ON arkon_eksik_is_olayi (tur, konu_tur, konu_id) NULLS NOT DISTINCT WHERE kapanis IS NULL;
CREATE INDEX arkon_eksik_is_olayi_acilis ON arkon_eksik_is_olayi (acilis);
