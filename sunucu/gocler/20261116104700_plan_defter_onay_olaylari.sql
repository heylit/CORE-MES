-- 3308-9 a: onaya gönderme, onaydan çekme, geri gönderme ve canlıya alma da değişiklik defterine yazılır ("kim neyi ne zaman" tek listede).
-- Yalnız iki kısıt genişler; var olan satır değişmez. Geri gönderme nedeni gerekçe sütununda durur.
ALTER TABLE plan_degisiklik_defteri
  DROP CONSTRAINT plan_degisiklik_defteri_gerekce,
  DROP CONSTRAINT plan_degisiklik_defteri_olay,
  ADD CONSTRAINT plan_degisiklik_defteri_olay CHECK (olay IN ('degisiklik', 'kaynak', 'uygulandi', 'reddedildi', 'geri-alindi',
    'onaya-gonderildi', 'onaydan-cekildi', 'geri-gonderildi', 'canliya-alindi')),
  ADD CONSTRAINT plan_degisiklik_defteri_gerekce CHECK (gerekce IS NULL OR (olay IN ('reddedildi', 'geri-gonderildi') AND length(gerekce) BETWEEN 1 AND 500));
