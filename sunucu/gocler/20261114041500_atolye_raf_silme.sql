-- 3230 a: boş raf haritadan silinebilir; malzemeli ya da açık işi olan rafı servis reddeder (denetim stok tablosunu okur, bu yüzden
-- tetikleyicide durmaz). Silinen raf ve rafla silinen elle girilmiş göz kalemi değişiklik defterine düşer. Salon yine silinmez.
DROP TRIGGER atolye_raf_silinmez ON atolye_raf;
CREATE TRIGGER atolye_raf_degisiklik AFTER DELETE ON atolye_raf
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
CREATE TRIGGER atolye_goz_kalemi_degisiklik AFTER DELETE ON atolye_goz_kalemi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
