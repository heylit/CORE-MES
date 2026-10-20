-- SmartES bağlantısı (kart #778, kullanıcı kararları 1a, 2a, 3b): kod eşlemesi, okunan makine gerçekleşenleri, okuma penceresi
-- ve iş emri giden kutusu. Başka modüllere yabancı anahtar yok (Aşama 1); bağlamada ayrı göçle gelir.

-- TMI kaydı -> SmartES kodu (karar 2a: eşleme bu modülde, sahip modüllere sütun eklenmez). tmi_id türün sahibi modüldeki kimliktir.
CREATE TABLE smartes_esleme (
  tur text NOT NULL CONSTRAINT smartes_esleme_tur CHECK (tur IN ('istasyon', 'makine', 'operasyon-tipi', 'durus-nedeni')),
  tmi_id int NOT NULL CONSTRAINT smartes_esleme_tmi_id CHECK (tmi_id > 0),
  smartes_kod text NOT NULL CONSTRAINT smartes_esleme_smartes_kod CHECK (smartes_kod ~ '^\S(.*\S)?$' AND length(smartes_kod) <= 50),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tur, tmi_id),
  -- Aynı SmartES kodu aynı türde iki TMI kaydına verilmez: okunan kayıt tek TMI kaydına döner.
  CONSTRAINT smartes_esleme_kod_tekil UNIQUE (tur, smartes_kod)
);

-- WorkOrdersStatusList satırı: SmartES iş emri durumu kimliğiyle bir kez (SME-12); yeniden okunursa sayılar güncellenir.
CREATE TABLE smartes_is_emri_durumu (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_is_emri_durumu_smartes_id CHECK (smartes_id > 0),
  is_emri_no text,
  erp_id text,
  istasyon_kodu text,
  operasyon_kodu text,
  makine_kodu text,
  stok_no text,
  -- Gelmeyen sayı boştur; sıfır uydurulmaz.
  saglam int,
  red int,
  makine_saglam int,
  makine_red int,
  baslangic timestamptz,
  bitis timestamptz,
  bitti boolean,
  -- SmartES'teki işaretler, okunduğu anki değeriyle.
  erp_saglam boolean,
  erp_red boolean,
  ham jsonb NOT NULL CONSTRAINT smartes_is_emri_durumu_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL,
  -- IsErp işaretlemesi (SME-13): bekliyor -> isaretlendi; hata bekleme süresiyle yeniden denenir.
  isaret_durumu text NOT NULL DEFAULT 'bekliyor' CONSTRAINT smartes_is_emri_durumu_isaret_durumu CHECK (isaret_durumu IN ('bekliyor', 'isaretlendi', 'hata')),
  isaret_deneme int NOT NULL DEFAULT 0 CONSTRAINT smartes_is_emri_durumu_isaret_deneme CHECK (isaret_deneme >= 0),
  isaret_son_deneme timestamptz,
  isaret_sonraki timestamptz,
  isaret_hata text CONSTRAINT smartes_is_emri_durumu_isaret_hata CHECK (isaret_hata IS NULL OR (btrim(isaret_hata) <> '' AND length(isaret_hata) <= 2000)),
  CONSTRAINT smartes_is_emri_durumu_isaret_butun CHECK ((isaret_hata IS NOT NULL) = (isaret_durumu = 'hata'))
);
CREATE INDEX smartes_is_emri_durumu_son_okuma ON smartes_is_emri_durumu (son_okuma, smartes_id);
CREATE INDEX smartes_is_emri_durumu_isaret ON smartes_is_emri_durumu (isaret_sonraki) WHERE isaret_durumu <> 'isaretlendi';

-- DownTimeList satırı, SmartES kimliğiyle bir kez.
CREATE TABLE smartes_durus (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_durus_smartes_id CHECK (smartes_id > 0),
  makine_kodu text,
  neden_kodu text,
  is_emri_no text,
  baslangic timestamptz,
  bitis timestamptz,
  ham jsonb NOT NULL CONSTRAINT smartes_durus_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);
CREATE INDEX smartes_durus_baslangic ON smartes_durus (baslangic, smartes_id);

-- AlarmsList satırı, SmartES kimliğiyle bir kez.
CREATE TABLE smartes_alarm (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_alarm_smartes_id CHECK (smartes_id > 0),
  makine_kodu text,
  alarm_kodu text,
  aciklama text,
  baslangic timestamptz,
  bitis timestamptz,
  ham jsonb NOT NULL CONSTRAINT smartes_alarm_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);
CREATE INDEX smartes_alarm_baslangic ON smartes_alarm (baslangic, smartes_id);

-- Okuma penceresi ("kaldığı yer") ve son denemenin izi (ADR 0010 karar 8). son_bitis yalnız başarılı okumada ilerler.
CREATE TABLE smartes_okuma (
  kaynak text PRIMARY KEY CONSTRAINT smartes_okuma_kaynak CHECK (kaynak IN ('is-emri-durumu', 'durus', 'alarm')),
  son_bitis timestamptz,
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_okuma_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_okuma_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  -- Son başarılı okumada gelen satır ve kimliği olmadığı için yazılamayan satır sayısı.
  okunan int CONSTRAINT smartes_okuma_okunan CHECK (okunan IS NULL OR okunan >= 0),
  kimliksiz int CONSTRAINT smartes_okuma_kimliksiz CHECK (kimliksiz IS NULL OR kimliksiz >= 0),
  CONSTRAINT smartes_okuma_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata'))
);

-- İş emri giden kutusu (SME-14): uretim-emirleri iş emri kimliği SmartES'e ErpID olarak gider. Satır gönderimin izidir.
CREATE TABLE smartes_giden (
  is_emri_id int PRIMARY KEY CONSTRAINT smartes_giden_is_emri_id CHECK (is_emri_id > 0),
  smartes_is_emri_no text NOT NULL CONSTRAINT smartes_giden_no CHECK (btrim(smartes_is_emri_no) <> '' AND length(smartes_is_emri_no) <= 100),
  -- Son başarılı gönderimin alan özeti; aynıysa yeniden gönderilmez.
  ozet text,
  durum text NOT NULL CONSTRAINT smartes_giden_durum CHECK (durum IN ('gonderildi', 'hata', 'kapandi')),
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT smartes_giden_deneme_sayisi CHECK (deneme_sayisi >= 0),
  ardisik_hata int NOT NULL DEFAULT 0 CONSTRAINT smartes_giden_ardisik_hata CHECK (ardisik_hata >= 0),
  son_deneme timestamptz NOT NULL,
  son_hata text CONSTRAINT smartes_giden_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  sonraki_deneme timestamptz,
  olusma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smartes_giden_butun CHECK ((son_hata IS NOT NULL) = (durum = 'hata') AND (durum <> 'hata' OR sonraki_deneme IS NOT NULL))
);
CREATE INDEX smartes_giden_son_deneme ON smartes_giden (son_deneme, is_emri_id);
