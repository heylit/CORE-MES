-- Emir adımının aşaması (2098-1 a): emir açılırken rota talimatındaki adımın aşaması kopyalanır; terminal üretim öncesi hazırlığı,
-- üretim hazırlığını ve üretim adımlarını buna göre ayırır. NOT NULL DEFAULT ile eklenir: var olan adımlar üretimdir, veri değişmez.
-- Sütun eklemek satır tetiğini (emir_adimi_degismez) çalıştırmaz.
ALTER TABLE emir_adimi
  ADD COLUMN asama text NOT NULL DEFAULT 'uretim'
    CONSTRAINT emir_adimi_asama_gecerli CHECK (asama IN ('on_hazirlik', 'hazirlik', 'uretim'));
