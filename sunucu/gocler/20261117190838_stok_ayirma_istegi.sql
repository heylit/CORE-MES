-- 3398-2 a: Stok kontrolde "stoktan karşıla" denince depoya ayırma isteği. Talep kaleminin miktarı karşılanan kadar azalır (satın alma
-- tarafı); istek açıkken ayrılan stok ölçüyle aramada ve ihtiyaç kuyruğunda yeniden önerilmez. Mevcut veri dönüştürülmez.
CREATE TABLE stok_ayirma_istegi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kaynak text NOT NULL DEFAULT 'satin-alma' CONSTRAINT stok_ayirma_istegi_kaynak_degeri CHECK (kaynak IN ('satin-alma')),
  -- Satın alma talebi ve kalemi: kalem tamamen karşılanınca silinir, bu yüzden yabancı anahtar yok; numara ve ad gösterim için saklanır.
  talep_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  talep_no text NOT NULL CONSTRAINT stok_ayirma_istegi_talep_no_bicimi CHECK (btrim(talep_no) <> '' AND length(talep_no) <= 40),
  kalem_ad text NOT NULL CONSTRAINT stok_ayirma_istegi_kalem_ad_bicimi CHECK (btrim(kalem_ad) <> '' AND length(kalem_ad) <= 160),
  malzeme_id integer NOT NULL CONSTRAINT stok_ayirma_istegi_malzeme_var REFERENCES malzeme_katalog_karti (no),
  miktar numeric(18,4) NOT NULL CONSTRAINT stok_ayirma_istegi_miktar_pozitif CHECK (miktar > 0),
  birim text NOT NULL CONSTRAINT stok_ayirma_istegi_birim_bicimi CHECK (btrim(birim) <> '' AND length(birim) <= 20),
  uretim_emri_id integer,
  -- Karşılayan stok: [{malzemeNo, artikId, stokMiktari, parca}]; açık istekte ölçüyle aramadan düşülür.
  kaynaklar jsonb NOT NULL CONSTRAINT stok_ayirma_istegi_kaynaklar_dizi CHECK (jsonb_typeof(kaynaklar) = 'array' AND jsonb_array_length(kaynaklar) > 0),
  -- Kalem tamamen karşılanıp silindiyse iptalde geri yüklemek için satırı.
  kalem_satiri jsonb,
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT stok_ayirma_istegi_durum_degeri CHECK (durum IN ('bekliyor', 'ayrildi', 'teslim', 'iptal')),
  iptal_nedeni text CONSTRAINT stok_ayirma_istegi_iptal_nedeni_bicimi CHECK (iptal_nedeni IS NULL OR (btrim(iptal_nedeni) <> '' AND length(iptal_nedeni) <= 200)),
  -- İptalde miktar talebe geri eklendi mi (talep teklif aşamasına geçtiyse eklenemez).
  geri_eklendi boolean,
  isteyen_kisi_id int NOT NULL REFERENCES kisi,
  istek_zamani timestamptz NOT NULL DEFAULT now(),
  karar_kisi_id int REFERENCES kisi,
  karar_zamani timestamptz,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_ayirma_istegi_karar_butun CHECK ((durum = 'bekliyor') = (karar_kisi_id IS NULL AND karar_zamani IS NULL)),
  CONSTRAINT stok_ayirma_istegi_iptal_butun CHECK ((durum = 'iptal') = (iptal_nedeni IS NOT NULL AND geri_eklendi IS NOT NULL))
);
CREATE INDEX stok_ayirma_istegi_acik_idx ON stok_ayirma_istegi (id) WHERE durum IN ('bekliyor', 'ayrildi');
