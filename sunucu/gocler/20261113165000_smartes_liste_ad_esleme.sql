-- SmartES'in kendi tanım listeleri ve fire/duruş adı eşlemesi (kart 3174): eşlemede kod elle yazılmasın, SmartES'ten okunan listeden seçilsin.
-- Yalnız yeni boş tablolar; var olan smartes_* tablolarına ve smartes_esleme'deki 'durus-nedeni' satırlarına dokunulmaz.

-- SmartES'ten okunan tanım satırı (WorkStationList, ActiveMachinesList, OperationList, RejectsList, DownTimeList). Anahtar kodlu türde koddur ('kod:<kod>'); fire ve duruşta SmartES kimliğidir
-- ('id:<n>'); kimlik gelmezse ad ('ad:<ad>'). Son başarılı okumada gelmeyen satır silinmez, var = false olur.
CREATE TABLE smartes_liste_kaydi (
  tur text NOT NULL CONSTRAINT smartes_liste_kaydi_tur CHECK (tur IN ('istasyon', 'makine', 'operasyon', 'fire', 'durus')),
  anahtar text NOT NULL CONSTRAINT smartes_liste_kaydi_anahtar CHECK (anahtar ~ '^(id|ad|kod):\S(.*\S)?$' AND length(anahtar) <= 210),
  smartes_id bigint CONSTRAINT smartes_liste_kaydi_smartes_id CHECK (smartes_id IS NULL OR smartes_id > 0),
  kod text CONSTRAINT smartes_liste_kaydi_kod CHECK (kod IS NULL OR (btrim(kod) <> '' AND length(kod) <= 200)),
  ad text CONSTRAINT smartes_liste_kaydi_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 200)),
  grup text,
  operator_kaynakli boolean,
  pasif boolean,
  var boolean NOT NULL DEFAULT true,
  ham jsonb NOT NULL CONSTRAINT smartes_liste_kaydi_ham CHECK (jsonb_typeof(ham) = 'object'),
  ilk_gorulme timestamptz NOT NULL,
  son_gorulme timestamptz NOT NULL,
  PRIMARY KEY (tur, anahtar),
  -- Kodsuz ve adsız satır eşlemede seçilemez.
  CONSTRAINT smartes_liste_kaydi_kod_ya_da_ad CHECK (kod IS NOT NULL OR ad IS NOT NULL)
);

-- Liste okumasının izi, tür başına tek satır. ilk_basarili: "yeni" ad ancak ilk listeden sonra gelen addır.
CREATE TABLE smartes_liste_okuma (
  tur text PRIMARY KEY CONSTRAINT smartes_liste_okuma_tur CHECK (tur IN ('istasyon', 'makine', 'operasyon', 'fire', 'durus')),
  son_deneme timestamptz NOT NULL,
  son_sonuc text NOT NULL CONSTRAINT smartes_liste_okuma_son_sonuc CHECK (son_sonuc IN ('tamam', 'hata')),
  son_hata text CONSTRAINT smartes_liste_okuma_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  ilk_basarili timestamptz,
  son_basarili timestamptz,
  okunan int CONSTRAINT smartes_liste_okuma_okunan CHECK (okunan IS NULL OR okunan >= 0),
  CONSTRAINT smartes_liste_okuma_butun CHECK ((son_hata IS NOT NULL) = (son_sonuc = 'hata')),
  CONSTRAINT smartes_liste_okuma_basarili CHECK ((ilk_basarili IS NULL) = (son_basarili IS NULL))
);

-- SmartES fire ya da duruş adı -> CORE hurda ya da duruş nedeni. Bir nedene birden çok ad bağlanabilir. neden_id sahibi modüldeki
-- kimliktir (durus-nedenleri); yabancı anahtar bağlamada ayrı göçle gelir. ad, eşlendiği andaki SmartES adıdır: hareket satırı adla gelir.
CREATE TABLE smartes_ad_esleme (
  tur text NOT NULL CONSTRAINT smartes_ad_esleme_tur CHECK (tur IN ('fire', 'durus')),
  anahtar text NOT NULL CONSTRAINT smartes_ad_esleme_anahtar CHECK (anahtar ~ '^(id|ad):\S(.*\S)?$' AND length(anahtar) <= 210),
  ad text NOT NULL CONSTRAINT smartes_ad_esleme_ad CHECK (btrim(ad) <> '' AND length(ad) <= 200),
  neden_id int NOT NULL CONSTRAINT smartes_ad_esleme_neden_id CHECK (neden_id > 0),
  -- Yalnız firede: hatalı kaydı (kalite kararına) ya da doğrudan hurda.
  sonuc text CONSTRAINT smartes_ad_esleme_sonuc CHECK (sonuc IS NULL OR sonuc IN ('hatali', 'hurda')),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tur, anahtar),
  CONSTRAINT smartes_ad_esleme_sonuc_butun CHECK ((tur = 'fire') = (sonuc IS NOT NULL))
);
