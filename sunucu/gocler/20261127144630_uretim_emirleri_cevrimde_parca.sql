-- Is emri adimi rotadaki cevrimde parca degerini kopyalar; tezgah sayaci cevrimi bu degerle parcaya cevirir.
ALTER TABLE uretim_emirleri_is_emri ADD COLUMN cevrimde_parca integer NOT NULL DEFAULT 1
  CONSTRAINT uretim_emirleri_is_emri_cevrimde_parca CHECK (cevrimde_parca BETWEEN 1 AND 1000);
