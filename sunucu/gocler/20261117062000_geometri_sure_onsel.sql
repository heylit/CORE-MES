-- 3363: süre tahmininin başlangıç katsayıları. Yerleşik değerler kodda (geometri kuralları, kaynaklarıyla); tabloda yalnız elle
-- değişenler durur, satır silinince yerleşiğe dönülür. Anahtar biçimi "tur.ad" (ör. malzeme.kaba.metal/karbon, kesme.pay); hangi
-- anahtarın geçerli olduğunu ve değer sınırını sunucu denetler, burada yalnız biçim ve pozitiflik. Yeni boş tablolar.
CREATE TABLE geometri_sure_katsayi (
  anahtar text CONSTRAINT geometri_sure_katsayi_pk PRIMARY KEY
    CONSTRAINT geometri_sure_katsayi_anahtar CHECK (anahtar ~ '^[a-z]+\.[a-z0-9./_-]{1,60}$'),
  deger numeric(8, 4) NOT NULL CONSTRAINT geometri_sure_katsayi_deger CHECK (deger >= 0 AND deger <= 100),
  not_metni text CONSTRAINT geometri_sure_katsayi_not CHECK (not_metni IS NULL OR (btrim(not_metni) <> '' AND char_length(not_metni) <= 200)),
  kisi_id int NOT NULL CONSTRAINT geometri_sure_katsayi_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);

-- Revizyonun yüzey pürüzlülüğü (Ra, µm) ve tolerans sınıfı. Revizyon kimliği geometri_analiz'deki gibi yabancı anahtarsızdır
-- (yön geometri -> cizimler). Satır yoksa varsayılan Ra 3,2 ve genel tolerans.
CREATE TABLE geometri_sure_tasarim (
  revizyon_id int CONSTRAINT geometri_sure_tasarim_pk PRIMARY KEY,
  ra text NOT NULL CONSTRAINT geometri_sure_tasarim_ra CHECK (ra IN ('6.3', '3.2', '1.6', '0.8', '0.4')),
  tolerans text NOT NULL CONSTRAINT geometri_sure_tasarim_tolerans CHECK (tolerans IN ('genel', 'hassas', 'cok-hassas', 'ultra')),
  kisi_id int NOT NULL CONSTRAINT geometri_sure_tasarim_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geometri_sure_katsayi_kisi_fk_idx ON geometri_sure_katsayi (kisi_id);
CREATE INDEX geometri_sure_tasarim_kisi_fk_idx ON geometri_sure_tasarim (kisi_id);
