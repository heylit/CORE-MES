-- 3177 b: sıra numaralı raf kodlamasına güncellemeyle kendiliğinden geçilir. Stok konumlarının kodu ilk eşlemede bir kez değişir;
-- değişen kodlar burada saklanır ki etiketler sonradan basılabilsin (3171 R4: liste kalıcı) ve uyarı basılana kadar görünsün.
-- Tek satır: ikinci sunucu ya da yarışan eşleme satırı ikinci kez yazamaz.
CREATE TABLE stok_raf_kod_gecisi (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT stok_raf_kod_gecisi_tek CHECK (tek),
  kodlama text NOT NULL CONSTRAINT stok_raf_kod_gecisi_kodlama CHECK (kodlama IN ('duz-sayi', 'bolme-kat-goz')),
  zaman timestamptz NOT NULL DEFAULT now(),
  degisenler jsonb NOT NULL CONSTRAINT stok_raf_kod_gecisi_degisenler_dizi CHECK (jsonb_typeof(degisenler) = 'array')
    CONSTRAINT stok_raf_kod_gecisi_degisenler_sinir CHECK (octet_length(degisenler::text) <= 8388608),
  eski_kodlu_raflar text[] NOT NULL DEFAULT '{}',
  -- Yeni kodu başka konumda olduğu için geçemeyen yerlerin adresi: eski kodda kalırlar, ekran adlarıyla söyler.
  atlanan text[] NOT NULL DEFAULT '{}',
  -- Pasif rafta stoğu olduğu için açık kalan konumların kodu: stok taşınınca sonraki eşleme kapatır.
  pasif_stoklu text[] NOT NULL DEFAULT '{}',
  basildi timestamptz,
  basan_kisi_id int CONSTRAINT stok_raf_kod_gecisi_basan_fk REFERENCES kisi,
  CONSTRAINT stok_raf_kod_gecisi_basan CHECK ((basildi IS NULL) = (basan_kisi_id IS NULL))
);
