-- Tezgah bağlantısı anlık okuma (kart 3659, ADR 0033 eki): probe alan tanımları, değer geçmişi, takım varlıkları, veri boşlukları.
-- Yalnız yeni boş tablolar; veri silmez, var olan tezgah_okuma ve tezgah_ornek değişmez.

-- /probe'dan: cihaz başına alan tanımı. Okuma her yenilendiğinde cihazın kümesi yeniden yazılır.
CREATE TABLE tezgah_alan_tanimi (
  cihaz_adi text NOT NULL CONSTRAINT tezgah_alan_tanimi_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  data_item_id text NOT NULL CONSTRAINT tezgah_alan_tanimi_kimlik CHECK (btrim(data_item_id) <> '' AND length(data_item_id) <= 100),
  tur text NOT NULL,
  alt_tur text,
  bilesen text,
  bilesen_adi text,
  birim text,
  kategori text NOT NULL CONSTRAINT tezgah_alan_tanimi_kategori CHECK (kategori IN ('SAMPLE', 'EVENT', 'CONDITION')),
  PRIMARY KEY (cihaz_adi, data_item_id)
);

-- Değer geçmişi (24 saat). Değer gelmediyse boştur; sıfır yazılmaz. Koşullarda kosul Normal, Warning, Fault ya da Unavailable'dır.
CREATE TABLE tezgah_deger_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_deger_gecmisi_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  data_item_id text NOT NULL,
  sira bigint NOT NULL,
  zaman timestamptz NOT NULL,
  deger text,
  kosul text CONSTRAINT tezgah_deger_gecmisi_kosul CHECK (kosul IS NULL OR kosul IN ('Normal', 'Warning', 'Fault', 'Unavailable')),
  CONSTRAINT tezgah_deger_gecmisi_tekil UNIQUE (cihaz_adi, data_item_id, sira, zaman)
);
CREATE INDEX tezgah_deger_gecmisi_okuma ON tezgah_deger_gecmisi (cihaz_adi, data_item_id, zaman);
CREATE INDEX tezgah_deger_gecmisi_zaman ON tezgah_deger_gecmisi (zaman);

-- /assets'ten takım varlıkları; ömürler [{tur, yon, deger, baslangic, uyari, sinir}] dizisidir (varsa).
CREATE TABLE tezgah_varlik (
  asset_id text PRIMARY KEY CONSTRAINT tezgah_varlik_asset_id CHECK (btrim(asset_id) <> '' AND length(asset_id) <= 100),
  tur text NOT NULL,
  takim_no text,
  omurler jsonb NOT NULL DEFAULT '[]' CONSTRAINT tezgah_varlik_omurler CHECK (jsonb_typeof(omurler) = 'array'),
  zaman timestamptz,
  okundu timestamptz NOT NULL
);

-- Servis tamponundan düşen ya da servisin yeniden başlaması yüzünden okunamayan aralık (tüm cihazlar için ortaktır).
CREATE TABLE tezgah_veri_boslugu (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL,
  neden text NOT NULL CONSTRAINT tezgah_veri_boslugu_neden CHECK (neden IN ('tampon-asildi', 'servis-yeniden-basladi')),
  istenen_sira bigint,
  ilk_sira bigint
);
CREATE INDEX tezgah_veri_boslugu_zaman ON tezgah_veri_boslugu (zaman);
