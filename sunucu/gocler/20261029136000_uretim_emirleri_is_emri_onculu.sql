-- Çok dallı rota (1248 a): emir açılırken rota adımının dalı ve öncül listesi iş emrine kopyalanır. Yeni ve boş iki tablo; dolu tabloya
-- dokunulmaz. Dal satırı olan iş emri öncül listelidir (öncülü olmayan dal başıdır); satırı olmayan iş emri 1248 öncesi kuraldadır (bir
-- önceki sıra, iş emrinin kendi bağımlılığıyla). Öncül aynı emirde ve daha küçük sıralıdır; bunu açan servis denetler.
CREATE TABLE uretim_emirleri_is_emri_dali (
  is_emri_id int PRIMARY KEY REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  -- Boş: ana hat.
  dal text CONSTRAINT uretim_emirleri_is_emri_dali_bicimi CHECK (dal IS NULL OR (btrim(dal) <> '' AND char_length(dal) <= 20))
);

CREATE TABLE uretim_emirleri_is_emri_onculu (
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri_dali ON DELETE CASCADE,
  oncul_is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  tur text NOT NULL CONSTRAINT uretim_emirleri_is_emri_onculu_tur CHECK (tur IN ('bekleyen', 'akisli')),
  -- Akışlı öncülden gelmesi beklenen adet; bekleyende boş.
  devir_adedi int CONSTRAINT uretim_emirleri_is_emri_onculu_devir CHECK ((tur = 'akisli') = (devir_adedi IS NOT NULL) AND (devir_adedi IS NULL OR devir_adedi > 0)),
  PRIMARY KEY (is_emri_id, oncul_is_emri_id),
  CONSTRAINT uretim_emirleri_is_emri_onculu_kendisi CHECK (is_emri_id <> oncul_is_emri_id)
);
CREATE INDEX uretim_emirleri_is_emri_onculu_oncul_idx ON uretim_emirleri_is_emri_onculu (oncul_is_emri_id);
