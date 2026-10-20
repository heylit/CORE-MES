-- SmartES kalite, hurda, ambar okuması ve tanım gönderimi: yalnız yeni boş tablolar. Var olan smartes_* tablolarına dokunulmaz
-- (smartes_okuma.kaynak ve smartes_esleme.tur kısıtları üç/dört değere kilitli; onlar değiştirilmeden yeni imleç ve gönderim izi ayrı tutulur).

-- RejectsList satırı, SmartES kimliğiyle bir kez. Alan adları canlı WSDL'de doğrulanmadı (VARSAYIM): ham satır her zaman saklanır.
CREATE TABLE smartes_red (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_red_smartes_id CHECK (smartes_id > 0),
  is_emri_no text,
  istasyon_kodu text,
  makine_kodu text,
  stok_no text,
  adet int,
  neden_kodu text,
  neden text,
  zaman timestamptz,
  ham jsonb NOT NULL CONSTRAINT smartes_red_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);
CREATE INDEX smartes_red_zaman ON smartes_red (zaman, smartes_id);

-- WarehouseStatusList satırı (ambar hareketi), SmartES kimliğiyle bir kez.
CREATE TABLE smartes_ambar_hareketi (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_ambar_hareketi_smartes_id CHECK (smartes_id > 0),
  is_emri_no text,
  stok_no text,
  ambar_kodu text,
  hareket_turu text,
  miktar numeric,
  zaman timestamptz,
  ham jsonb NOT NULL CONSTRAINT smartes_ambar_hareketi_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);
CREATE INDEX smartes_ambar_hareketi_zaman ON smartes_ambar_hareketi (zaman, smartes_id);

-- QualityControlStatusList satırı (kalite kontrol sonucu), SmartES kimliğiyle bir kez.
CREATE TABLE smartes_kalite_kontrol (
  smartes_id bigint PRIMARY KEY CONSTRAINT smartes_kalite_kontrol_smartes_id CHECK (smartes_id > 0),
  is_emri_no text,
  stok_no text,
  istasyon_kodu text,
  makine_kodu text,
  olcum_adi text,
  olcum_degeri text,
  sonuc text,
  zaman timestamptz,
  ham jsonb NOT NULL CONSTRAINT smartes_kalite_kontrol_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_okuma timestamptz NOT NULL,
  son_okuma timestamptz NOT NULL
);
CREATE INDEX smartes_kalite_kontrol_zaman ON smartes_kalite_kontrol (zaman, smartes_id);

-- Yeni akışların imleci ve son deneme izi (smartes_okuma ile aynı anlam). 'tanim' akışında son_bitis kullanılmaz.
CREATE TABLE smartes_akis_izi (
  akis text PRIMARY KEY CONSTRAINT smartes_akis_izi_akis CHECK (akis IN ('red', 'ambar', 'kalite', 'tanim')),
  son_bitis timestamptz,
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_akis_izi_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_akis_izi_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  okunan int CONSTRAINT smartes_akis_izi_okunan CHECK (okunan IS NULL OR okunan >= 0),
  kimliksiz int CONSTRAINT smartes_akis_izi_kimliksiz CHECK (kimliksiz IS NULL OR kimliksiz >= 0),
  CONSTRAINT smartes_akis_izi_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata'))
);

-- Tanım gönderiminin izi: SmartES'e kod tanımı gönderilen istasyon ve stok kartı. Satır gönderim kalkanıdır:
-- niyet istekten önceki turda yazılır; sonucu bilinmeyen gönderim 'belirsiz' kalır ve kendiliğinden yinelenmez.
CREATE TABLE smartes_tanim_giden (
  tur text NOT NULL CONSTRAINT smartes_tanim_giden_tur CHECK (tur IN ('istasyon', 'stok')),
  tmi_id int NOT NULL CONSTRAINT smartes_tanim_giden_tmi_id CHECK (tmi_id > 0),
  kod text NOT NULL CONSTRAINT smartes_tanim_giden_kod CHECK (btrim(kod) <> '' AND length(kod) <= 200),
  durum text NOT NULL CONSTRAINT smartes_tanim_giden_durum CHECK (durum IN ('niyet', 'gonderildi', 'zaten-var', 'hata', 'belirsiz')),
  niyet_zamani timestamptz,
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT smartes_tanim_giden_deneme_sayisi CHECK (deneme_sayisi >= 0),
  ardisik_hata int NOT NULL DEFAULT 0 CONSTRAINT smartes_tanim_giden_ardisik_hata CHECK (ardisik_hata >= 0),
  son_deneme timestamptz,
  son_hata text CONSTRAINT smartes_tanim_giden_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  sonraki_deneme timestamptz,
  olusma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tur, tmi_id),
  CONSTRAINT smartes_tanim_giden_hata_butun CHECK ((durum IN ('hata', 'belirsiz')) = (son_hata IS NOT NULL)),
  CONSTRAINT smartes_tanim_giden_niyet_butun CHECK (durum <> 'niyet' OR niyet_zamani IS NOT NULL),
  CONSTRAINT smartes_tanim_giden_hata_bekleme CHECK (durum <> 'hata' OR sonraki_deneme IS NOT NULL)
);
