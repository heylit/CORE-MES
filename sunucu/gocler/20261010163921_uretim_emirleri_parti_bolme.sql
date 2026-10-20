-- Parti bölme (kart #262, kullanıcı kararı A ve göç onayı 2026-10-10): bölünen parti üst emre bağlı ayrı emirdir; alt emir yeniden
-- bölünebilir. İki boş olabilen sütun eklenir, var olan satırlar değişmez (bölünmemiş emirde ikisi de boştur).

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM uretim_emri;
  RAISE NOTICE 'uretim_emri: % satır var; göç yalnız boş sütun ekler', satir;
END $$;

ALTER TABLE uretim_emri
  ADD COLUMN ust_emir_id int CONSTRAINT uretim_emri_ust_emir REFERENCES uretim_emri,
  -- Alt emrin bölündüğü iş emrinin sırası: alt emir o adımdan sonuna kadar iş emirlerini taşır.
  ADD COLUMN bolunme_sira int CONSTRAINT uretim_emri_bolunme_sira_pozitif CHECK (bolunme_sira > 0),
  ADD CONSTRAINT uretim_emri_bolunme_tutarli CHECK ((ust_emir_id IS NULL) = (bolunme_sira IS NULL)),
  ADD CONSTRAINT uretim_emri_kendine_bagli_degil CHECK (ust_emir_id IS NULL OR ust_emir_id <> id),
  ADD CONSTRAINT uretim_emri_bolunen_rotali CHECK (ust_emir_id IS NULL OR malzeme_no IS NOT NULL);
