-- Yarım kalan mal kabul kişinin hesabında taslak olarak durur (3087 a, 3091 a): kişi başına tek satır, form durumu jsonb.
-- Sürüm aynı kişinin iki cihazından gelen yazmayı ayırır; teslimde mal kabul aynı işlemde satırı siler.
CREATE TABLE stok_mal_kabul_taslagi (
  kisi_id int PRIMARY KEY CONSTRAINT stok_mal_kabul_taslagi_kisi_fk REFERENCES kisi,
  govde jsonb NOT NULL CONSTRAINT stok_mal_kabul_taslagi_govde_nesne CHECK (jsonb_typeof(govde) = 'object')
    CONSTRAINT stok_mal_kabul_taslagi_govde_sinir CHECK (octet_length(govde::text) <= 262144),
  surum int NOT NULL DEFAULT 1 CONSTRAINT stok_mal_kabul_taslagi_surum_gecerli CHECK (surum > 0),
  guncellendi timestamptz NOT NULL DEFAULT now()
);
