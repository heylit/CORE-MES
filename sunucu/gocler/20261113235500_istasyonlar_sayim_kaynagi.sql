-- 3173: istasyonda üretim adedi ya terminalden ya SmartES'ten sayılır, ikisi birlikte değil (aynı üretim iki kez stoğa girmesin).
-- Yalnız ekleyen göç: var olan istasyonlar terminalden sayılır. Geçerlilik, kaynağın son değiştiği andır (sunucu saati): SmartES'e
-- geçmeden önce başlamış SmartES satırı aktarılmaz; hiç değişmemiş istasyonda boştur.
ALTER TABLE istasyon
  ADD COLUMN sayim_kaynagi text NOT NULL DEFAULT 'terminal' CONSTRAINT istasyon_sayim_kaynagi_degeri CHECK (sayim_kaynagi IN ('terminal', 'smartes')),
  ADD COLUMN sayim_kaynagi_gecerlilik timestamptz,
  ADD CONSTRAINT istasyon_sayim_kaynagi_gecerli CHECK (sayim_kaynagi = 'terminal' OR sayim_kaynagi_gecerlilik IS NOT NULL);
