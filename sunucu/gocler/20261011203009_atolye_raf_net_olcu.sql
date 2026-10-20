-- Rafın net ölçüleri (isteğe bağlı): her katın net yüksekliği (alttan üste), göz net eni ve derinliği.
-- Boş bırakılan raf eskisi gibi raf türünden hesaplanır; var olan satırlar değişmez (sütunlar boş başlar).
ALTER TABLE atolye_raf
  ADD COLUMN kat_yukseklikleri numeric(4, 2)[] NULL,
  ADD COLUMN goz_genisligi numeric(4, 2) NULL,
  ADD COLUMN goz_derinligi numeric(4, 2) NULL;

ALTER TABLE atolye_raf
  ADD CONSTRAINT atolye_raf_kat_yukseklikleri CHECK (
    kat_yukseklikleri IS NULL OR (
      array_ndims(kat_yukseklikleri) = 1
      AND cardinality(kat_yukseklikleri) = kat_sayisi
      AND array_position(kat_yukseklikleri, NULL) IS NULL
      AND 0.05 <= ALL (kat_yukseklikleri)
      AND 15 >= ALL (kat_yukseklikleri)
    )
  ),
  ADD CONSTRAINT atolye_raf_goz_net CHECK (
    (goz_genisligi IS NULL OR goz_genisligi BETWEEN 0.05 AND 10)
    AND (goz_derinligi IS NULL OR goz_derinligi BETWEEN 0.05 AND 10)
  );
