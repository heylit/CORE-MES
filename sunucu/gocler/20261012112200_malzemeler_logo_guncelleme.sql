-- Logo'ya gitmiş kartın adı değişince Logo'daki kart güncellenir (kart #783, kullanıcı kararı S4 b ve göç onayı 12.10.2026).
-- Yalnız boş olabilen sütun eklenir; var olan satırların değeri değişmez (sütunlar NULL başlar).
DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM malzeme_katalog_karti;
  RAISE NOTICE 'malzeme_katalog_karti: % satır; göç yalnız boş sütun ekler, satır değiştirmez', satir;
END $$;

ALTER TABLE malzeme_katalog_karti
  ADD COLUMN logo_guncelleme_durumu text CONSTRAINT malzeme_katalog_karti_logo_guncelleme_durumu CHECK (logo_guncelleme_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_guncelleme_hata text
    CONSTRAINT malzeme_katalog_karti_logo_guncelleme_hata_dolu CHECK (logo_guncelleme_hata IS NULL OR (btrim(logo_guncelleme_hata) <> '' AND length(logo_guncelleme_hata) <= 2000)),
  ADD COLUMN logo_guncelleme_zamani timestamptz,
  -- Güncelleme yalnız Logo kaydı olan kartta olur; durum ve zamanı birlikte, hata metni yalnız hata durumunda.
  ADD CONSTRAINT malzeme_katalog_karti_logo_guncelleme_butun CHECK (
    (logo_guncelleme_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_guncelleme_durumu IS NULL) = (logo_guncelleme_zamani IS NULL)
    AND (logo_guncelleme_hata IS NOT NULL) = (logo_guncelleme_durumu IS NOT DISTINCT FROM 'hata')
  );
