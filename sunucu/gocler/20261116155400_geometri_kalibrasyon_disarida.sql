-- 3321 S2 a: süre kalibrasyonundan çıkarılan parça (aykırı ölçüm, bozuk model). Çarpanlar okumada hesaplanır, tabloya yazılmaz;
-- yalnız bu işaret saklanır. Ölçümü ve modeli silmez; "Geri al" satırı kaldırır.
CREATE TABLE geometri_kalibrasyon_disarida (
  malzeme_no int CONSTRAINT geometri_kalibrasyon_disarida_pk PRIMARY KEY
    CONSTRAINT geometri_kalibrasyon_disarida_malzeme REFERENCES malzeme_katalog_karti (no),
  neden text CONSTRAINT geometri_kalibrasyon_disarida_neden CHECK (neden IS NULL OR (btrim(neden) <> '' AND char_length(neden) <= 200)),
  kisi_id int NOT NULL CONSTRAINT geometri_kalibrasyon_disarida_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
