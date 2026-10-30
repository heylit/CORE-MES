-- Dal çarpanı (1257 a): bir mamul için o dal adımında kaç adet işlenir. Boş: 1. Yalnız dal satırı olan adımda tutulur (ana hat 1 mamul
-- içindir). Emir açılırken rota adımından iş emrine kopyalanır; adımın işleyeceği adet emir adedi x çarpan, eksi öncüllerden gelen kayıp.
-- İki tablo da 1248 a ile gelen dal tablolarıdır; dolu satır değişmez, yalnız boş olabilen sütun eklenir.
ALTER TABLE rota_adim_dali
  ADD COLUMN adet_carpani int CONSTRAINT rota_adim_dali_adet_carpani CHECK (adet_carpani > 0 AND adet_carpani <= 1000),
  ADD CONSTRAINT rota_adim_dali_carpan_dalda CHECK (adet_carpani IS NULL OR dal IS NOT NULL);

ALTER TABLE uretim_emirleri_is_emri_dali
  ADD COLUMN adet_carpani int CONSTRAINT uretim_emirleri_is_emri_dali_adet_carpani CHECK (adet_carpani > 0 AND adet_carpani <= 1000),
  ADD CONSTRAINT uretim_emirleri_is_emri_dali_carpan_dalda CHECK (adet_carpani IS NULL OR dal IS NOT NULL);
