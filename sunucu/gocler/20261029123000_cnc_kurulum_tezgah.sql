-- Tezgâh ayarı (1091 a, 1139 b): tezgâh listesi İstasyonlar'ın makine kayıtlarıdır; motorun istediği alanlar (kontrol, konik,
-- cep, devir) burada, makine başına tutulur. Makine istasyonsuz olabilir; takım yükü ve iş emri istasyon başınadır, ikisi
-- makinenin istasyonu üzerinden eşleşir. Alanlar prototipin kodlarıyla saklanır; bilinmeyen alan boştur, sıfır yazılmaz.
-- Satır yoksa makinenin ayarı yoktur. Makine silinmez, pasiflenir: ayarı olan makinenin silinmesi reddedilir.
CREATE TABLE cnc_kurulum_tezgah (
  makine_id int PRIMARY KEY REFERENCES makine,
  tur text CONSTRAINT cnc_kurulum_tezgah_tur CHECK (tur IN ('mill', 'lathe', 'millturn')),
  kontrol text CONSTRAINT cnc_kurulum_tezgah_kontrol CHECK (kontrol IN ('heid', 'iso')),
  konik text CONSTRAINT cnc_kurulum_tezgah_konik CHECK (konik IS NULL OR (btrim(konik) <> '' AND char_length(konik) <= 40)),
  cep_sayisi smallint CONSTRAINT cnc_kurulum_tezgah_cep CHECK (cep_sayisi BETWEEN 1 AND 999),
  devir int CONSTRAINT cnc_kurulum_tezgah_devir CHECK (devir BETWEEN 1 AND 100000),
  is_mili_devri int CONSTRAINT cnc_kurulum_tezgah_is_mili CHECK (is_mili_devri BETWEEN 1 AND 100000),
  canli_takim boolean,
  canli_devir int CONSTRAINT cnc_kurulum_tezgah_canli_devir CHECK (canli_devir BETWEEN 1 AND 100000),
  elle boolean,
  -- Prosedürel 3B modelin türü (m_vmc, m_5ax, ...); makineye ya da istasyonuna bağlı yayındaki model varsa o kullanılır (1092 a).
  model_turu text CONSTRAINT cnc_kurulum_tezgah_model CHECK (model_turu ~ '^m_[a-z0-9]{1,20}$'),
  surum int NOT NULL DEFAULT 1 CONSTRAINT cnc_kurulum_tezgah_surum CHECK (surum > 0),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnc_kurulum_tezgah_canli CHECK (canli_devir IS NULL OR canli_takim IS TRUE)
);
