-- Karar hedefleri (1647; karar 1610 a): stok kararı parti başınadır ('stok', hedef kimliği parti), partisiz bakiye malzeme başına
-- ('partisiz_stok', hedef kimliği malzeme), yoldaki malzeme açık satın alma sipariş satırıdır ('siparis_satiri'). Var olan satırlar
-- değişmez; yalnız izin verilen değer listesi genişler.
ALTER TABLE degisiklik_yonetimi_karar
  DROP CONSTRAINT degisiklik_yonetimi_karar_hedef_degeri,
  ADD CONSTRAINT degisiklik_yonetimi_karar_hedef_degeri CHECK (hedef IN ('emir', 'stok', 'partisiz_stok', 'siparis_satiri'));
