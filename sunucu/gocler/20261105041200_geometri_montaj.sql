-- 3D Atölyesi montaj ağacı (kart 2109, M1): STEP montajının düğümleri, ön sıralı. Yeni boş tablo. Satırlar analizle aynı işlemde
-- yenilenir; ölçüler yalnız öneridir (2101-2 b). Revizyon kimliği geometri_yuz'daki gibi yabancı anahtarsızdır.
CREATE TABLE geometri_montaj (
  revizyon_id int NOT NULL,
  sira int NOT NULL CONSTRAINT geometri_montaj_sira CHECK (sira >= 1),
  -- Ön sırada üst her zaman alttan öncedir; kökte null.
  ust_sira int CONSTRAINT geometri_montaj_ust CHECK (ust_sira IS NULL OR (ust_sira >= 1 AND ust_sira < sira)),
  tur text NOT NULL CONSTRAINT geometri_montaj_tur CHECK (tur IN ('montaj', 'parca')),
  ad text CONSTRAINT geometri_montaj_ad CHECK (ad IS NULL OR (btrim(ad) <> '' AND length(ad) <= 200)),
  -- Dünya koordinatında eksenlere hizalı kutu; parçasız montajda null.
  kutu_en numeric(14, 4)[] CONSTRAINT geometri_montaj_kutu_en CHECK (kutu_en IS NULL OR cardinality(kutu_en) = 3),
  kutu_ust numeric(14, 4)[] CONSTRAINT geometri_montaj_kutu_ust CHECK (kutu_ust IS NULL OR cardinality(kutu_ust) = 3),
  obb_a_mm numeric(14, 4),
  obb_b_mm numeric(14, 4),
  obb_c_mm numeric(14, 4),
  hacim_mm3 numeric(20, 4) CONSTRAINT geometri_montaj_hacim CHECK (hacim_mm3 IS NULL OR hacim_mm3 > 0),
  alan_mm2 numeric(20, 4),
  kapali boolean,
  motor text NOT NULL CONSTRAINT geometri_montaj_motor CHECK (btrim(motor) <> ''),
  -- Parçada ölçüler dolu, montajda boş; kapalı olmayan ağda hacim yok (sıfır uydurulmaz).
  CONSTRAINT geometri_montaj_parca_olcu CHECK (
    (tur = 'parca' AND obb_a_mm >= 0 AND obb_b_mm >= 0 AND obb_c_mm >= 0 AND alan_mm2 >= 0 AND kapali IS NOT NULL
      AND kutu_en IS NOT NULL AND kutu_ust IS NOT NULL AND (kapali OR hacim_mm3 IS NULL))
    OR (tur = 'montaj' AND obb_a_mm IS NULL AND obb_b_mm IS NULL AND obb_c_mm IS NULL AND hacim_mm3 IS NULL AND alan_mm2 IS NULL AND kapali IS NULL)
  ),
  PRIMARY KEY (revizyon_id, sira)
);
