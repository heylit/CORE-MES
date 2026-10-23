-- 392 a ve 258 a: yetki tabloları (rol, rolün işlemleri, kişinin rolleri ve ek işlemleri) değişiklik defterine düşer
-- (denetim modülünün ortak tetik işlevi). Yetki vermek ekleme, geri almak silmedir: üç işlem de yazılır.
-- Tetik olduğu için yetki ekranından da göçten de gelen değişim deftere girer; göçte kişi boş kalır.
CREATE TRIGGER rol_degisiklik AFTER INSERT OR UPDATE OR DELETE ON rol
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');

CREATE TRIGGER rol_islemi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON rol_islemi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('rol_id,islem');

CREATE TRIGGER kisi_rolu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON kisi_rolu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id,rol_id');

CREATE TRIGGER kisi_islemi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON kisi_islemi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id,islem');
