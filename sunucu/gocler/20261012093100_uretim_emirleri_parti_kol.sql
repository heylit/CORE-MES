-- Parti kolu (kullanıcı kararları PB-K1..K6, 2026-10-12): bölünen kol rework, tamir ya da ek adımla yürür ve seçilen adımda üst emre
-- birleşir. Dolu tablolara yalnız varsayılanlı ya da boş olabilen sütun eklenir; var olan satırlar değişmez (iş emirleri 'rota' olur).

DO $$
DECLARE emir bigint; is_emri bigint;
BEGIN
  SELECT count(*) INTO emir FROM uretim_emri;
  SELECT count(*) INTO is_emri FROM uretim_emirleri_is_emri;
  RAISE NOTICE 'uretim_emri: % satır, uretim_emirleri_is_emri: % satır; göç yalnız sütun ekler', emir, is_emri;
END $$;

ALTER TABLE uretim_emirleri_is_emri
  -- Rotadan gelen adım 'rota'dır; kola sonradan konan adım türünü taşır ve rotayı yeniden uygulamak onu silmez.
  ADD COLUMN tur text NOT NULL DEFAULT 'rota' CONSTRAINT uretim_emirleri_is_emri_tur CHECK (tur IN ('rota', 'rework', 'tamir', 'ek')),
  ADD COLUMN ek_aciklama text CONSTRAINT uretim_emirleri_is_emri_ek_aciklama_bicimi
    CHECK (ek_aciklama IS NULL OR (btrim(ek_aciklama) <> '' AND char_length(ek_aciklama) <= 300)),
  ADD CONSTRAINT uretim_emirleri_is_emri_ek_aciklama_ekte CHECK (tur <> 'rota' OR ek_aciklama IS NULL);

-- Kolun üst emre katıldığı (planlıysa katılacağı) adımın operasyon numarası. Sıra değil op: kola ek adım girince kolun sıraları kayar,
-- op numarası iki emirde aynı adımı gösterir. Birleşme adımı ve sonrası yalnız üstte yapılır; kol o adımları taşımaz.
ALTER TABLE uretim_emri
  ADD COLUMN birlesme_op_no int CONSTRAINT uretim_emri_birlesme_op_pozitif CHECK (birlesme_op_no > 0),
  ADD CONSTRAINT uretim_emri_birlesme_kolda CHECK (birlesme_op_no IS NULL OR ust_emir_id IS NOT NULL);
