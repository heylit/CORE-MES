-- Elle bölme (kart #1572): bir iş emri adetiyle parçalara bölünür, her parça kendi makinesinde ya da kişisinde ayrı yerleşir. Ana yerleşim
-- satırı zarftır (ilk parçanın kaynağı, ilk başlangıç, son bitiş). Bölme planlamacının kararıdır: motor işi yerleştiremezse parçalar yersiz
-- (kaynak ve saat boş) kalır, iş uyarıyla yerleşmemiş görünür; bölmeyi yalnız planlamacı kaldırır. Parça satırı olmayan iş bölünmemiştir.
CREATE TABLE plan_yerlesim_parcasi (
  is_emri_id int NOT NULL,
  parca_no int NOT NULL CONSTRAINT plan_yerlesim_parcasi_no CHECK (parca_no > 0),
  adet int NOT NULL CONSTRAINT plan_yerlesim_parcasi_adet CHECK (adet > 0),
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  baslangic timestamptz,
  bitis timestamptz,
  elle_sira int,
  elle_istasyon_id int REFERENCES istasyon,
  elle_kaynak boolean NOT NULL DEFAULT false,
  PRIMARY KEY (is_emri_id, parca_no),
  CONSTRAINT plan_yerlesim_parcasi_yer CHECK (
    (baslangic IS NULL AND bitis IS NULL AND makine_id IS NULL AND kisi_id IS NULL)
    OR (baslangic IS NOT NULL AND bitis > baslangic AND (makine_id IS NULL) <> (kisi_id IS NULL)))
);

CREATE TABLE plan_senaryo_yerlesim_parcasi (
  senaryo_id int NOT NULL REFERENCES plan_senaryosu,
  is_emri_id int NOT NULL,
  parca_no int NOT NULL CONSTRAINT plan_senaryo_yerlesim_parcasi_no CHECK (parca_no > 0),
  adet int NOT NULL CONSTRAINT plan_senaryo_yerlesim_parcasi_adet CHECK (adet > 0),
  makine_id int REFERENCES makine,
  kisi_id int REFERENCES kisi,
  baslangic timestamptz,
  bitis timestamptz,
  elle_sira int,
  elle_istasyon_id int REFERENCES istasyon,
  elle_kaynak boolean NOT NULL DEFAULT false,
  PRIMARY KEY (senaryo_id, is_emri_id, parca_no),
  CONSTRAINT plan_senaryo_yerlesim_parcasi_yer CHECK (
    (baslangic IS NULL AND bitis IS NULL AND makine_id IS NULL AND kisi_id IS NULL)
    OR (baslangic IS NOT NULL AND bitis > baslangic AND (makine_id IS NULL) <> (kisi_id IS NULL)))
);
