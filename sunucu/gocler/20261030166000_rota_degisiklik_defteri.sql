-- 1372 a: rota revizyonu ve adımları değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Yürürlükteki
-- revizyonu kilit tetiği zaten korur; defter taslakta yapılan düzeltmeyi ve durum geçişlerini kişisiyle tutar.
CREATE TRIGGER rota_revizyonu_degisiklik AFTER UPDATE OR DELETE ON rota_revizyonu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');

CREATE TRIGGER rota_adimi_degisiklik AFTER UPDATE OR DELETE ON rota_adimi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
