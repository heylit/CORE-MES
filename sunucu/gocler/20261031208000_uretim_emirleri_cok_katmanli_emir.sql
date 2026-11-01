-- 1476 (1484 a, 1476 teyit): tek üretim emri çok katmanlı reçetenin tamamını taşır. Emir açıldığı patlamış rotayı (rota_patlatma)
-- gösterir; her iş emri hangi düğümün (alt parçanın) adımı olduğunu, rotadaki op numarasını ve kök başına adedini taşır. Emir içinde op_no
-- tekilliği korunur: kök adımlar rotadaki numarayla, alt düğüm adımları yeni numarayla açılır (rota modülü cokKatmanaCevir).
-- Dolu tablolar: yalnız boş olabilen sütun eklenir; var olan satır ve kısıt değişmez (tek katmanlı emirde dördü de boştur).
-- Geri alma (çok katmanlı emir açılmadan önce): eklenen kısıt, sütunlar ve dizin DROP edilir; sonrasında o emirlerin düğüm bilgisi kaybolur.
DO $$
DECLARE e bigint; i bigint;
BEGIN
  SELECT count(*) INTO e FROM uretim_emri;
  SELECT count(*) INTO i FROM uretim_emirleri_is_emri;
  RAISE NOTICE 'uretim_emri % satır, uretim_emirleri_is_emri % satır; göç yalnız boş sütun ekler', e, i;
END $$;

ALTER TABLE uretim_emri
  ADD COLUMN patlatma_id int CONSTRAINT uretim_emri_patlatma REFERENCES rota_patlatma,
  ADD CONSTRAINT uretim_emri_patlatma_rotali CHECK (patlatma_id IS NULL OR kaynak_rota_revizyonu_id IS NOT NULL);
CREATE INDEX uretim_emri_patlatma_dizini ON uretim_emri (patlatma_id) WHERE patlatma_id IS NOT NULL;

ALTER TABLE uretim_emirleri_is_emri
  ADD COLUMN dugum text CONSTRAINT uretim_emirleri_is_emri_dugum_bicimi CHECK (dugum ~ '^0(\.[1-9][0-9]*)*$' AND char_length(dugum) <= 40),
  ADD COLUMN dugum_malzeme_id int CONSTRAINT uretim_emirleri_is_emri_dugum_malzeme REFERENCES malzeme_katalog_karti (no),
  ADD COLUMN kaynak_op_no int CONSTRAINT uretim_emirleri_is_emri_kaynak_op_pozitif CHECK (kaynak_op_no > 0),
  ADD COLUMN birim_carpani numeric(14,4) CONSTRAINT uretim_emirleri_is_emri_birim_carpani_pozitif CHECK (birim_carpani > 0),
  ADD CONSTRAINT uretim_emirleri_is_emri_dugum_tutarli CHECK (
    (dugum IS NULL) = (dugum_malzeme_id IS NULL) AND (dugum IS NULL) = (kaynak_op_no IS NULL) AND (dugum IS NULL) = (birim_carpani IS NULL));
CREATE INDEX uretim_emirleri_is_emri_dugum_malzeme_fk_idx ON uretim_emirleri_is_emri (dugum_malzeme_id) WHERE dugum_malzeme_id IS NOT NULL;
