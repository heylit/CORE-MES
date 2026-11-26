-- 3760: üretim kaynağı makine başına seçilebilir; boş makine istasyonun kaynağına uyar. Geçerlilik, makinenin seçimi her değiştiğinde
-- (istasyona uymaya dönüş dahil) yazılır: o andan önce başlamış SmartES satırı bu makinede aktarılmaz.
ALTER TABLE makine
  ADD COLUMN uretim_kaynagi text CONSTRAINT makine_uretim_kaynagi_degeri CHECK (uretim_kaynagi IN ('terminal', 'smartes')),
  ADD COLUMN uretim_kaynagi_gecerlilik timestamptz,
  ADD CONSTRAINT makine_uretim_kaynagi_gecerli CHECK (uretim_kaynagi IS NULL OR uretim_kaynagi_gecerlilik IS NOT NULL);
