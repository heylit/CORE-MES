-- 258 a: kişinin iş merkezi ataması (kimin hangi istasyonda kayıt girebileceği) değişiklik defterine düşer
-- (denetim modülünün ortak tetik işlevi). Atama vermek ekleme, geri almak silmedir: üç işlem de yazılır.
CREATE TRIGGER kisi_is_merkezi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON kisi_is_merkezi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kisi_id,is_merkezi_id');
