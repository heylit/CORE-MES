-- 3417 a: Sayım ve düzeltme sayfası. Sayım farkı kaynağını (göz sayımı ya da kartı sıfırlama) ve sıfırlamanın nedenini, açıklamasını taşır.
-- Var olan satırlar 'sayim' kaynağıyla, nedensiz kalır; başka veri değişmez.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_sayim_farki;
  RAISE NOTICE 'stok_sayim_duzeltme: % sayim farki satirina kaynak = sayim eklenir; baska satir degismez.', n;
END $$;
ALTER TABLE stok_sayim_farki
  ADD COLUMN kaynak text NOT NULL DEFAULT 'sayim' CONSTRAINT stok_sayim_farki_kaynak_degeri CHECK (kaynak IN ('sayim', 'sifirlama')),
  ADD COLUMN neden text CONSTRAINT stok_sayim_farki_neden_degeri CHECK (neden IN ('kart_kapatilacak', 'kayip', 'hasarli', 'yanlis_giris')),
  ADD COLUMN aciklama text CONSTRAINT stok_sayim_farki_aciklama_bicimi CHECK (btrim(aciklama) <> '' AND length(aciklama) <= 200),
  -- Sıfırlama her zaman nedenlidir ve sıfıra iner; sayımın nedeni ve açıklaması yoktur.
  ADD CONSTRAINT stok_sayim_farki_sifirlama_nedenli CHECK ((kaynak = 'sifirlama') = (neden IS NOT NULL)),
  ADD CONSTRAINT stok_sayim_farki_sifirlama_sifira CHECK (kaynak <> 'sifirlama' OR sayilan_miktar = 0),
  ADD CONSTRAINT stok_sayim_farki_aciklama_sifirlamada CHECK (aciklama IS NULL OR kaynak = 'sifirlama');
