-- Talimat adımının aşaması (2098-1 a): üretim öncesi hazırlık (başka iş sürerken), üretim hazırlığı (ayar) ya da üretim.
-- NOT NULL DEFAULT ile eklenir: var olan adımlar üretim aşamasındadır, veri değişmez. Sütun eklemek satır tetiğini çalıştırmaz;
-- yalnız ekleme kuralı (rota_talimat_adimi_degismez) yayınlanmış adımların sonraki UPDATE'ini yine reddeder.
ALTER TABLE rota_talimat_adimi
  ADD COLUMN asama text NOT NULL DEFAULT 'uretim'
    CONSTRAINT rota_talimat_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim'));
ALTER TABLE rota_talimat_sablon_adimi
  ADD COLUMN asama text NOT NULL DEFAULT 'uretim'
    CONSTRAINT rota_talimat_sablon_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim'));
ALTER TABLE rota_talimat_taslak_adimi
  ADD COLUMN asama text NOT NULL DEFAULT 'uretim'
    CONSTRAINT rota_talimat_taslak_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim'));
