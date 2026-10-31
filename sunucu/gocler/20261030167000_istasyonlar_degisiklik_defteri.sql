-- 1372 a: iş merkezi, istasyon ve makine kartları değişiklik defterine düşer (denetim modülünün ortak tetik işlevi).
CREATE TRIGGER is_merkezi_degisiklik AFTER UPDATE OR DELETE ON is_merkezi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');

CREATE TRIGGER istasyon_degisiklik AFTER UPDATE OR DELETE ON istasyon
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');

CREATE TRIGGER makine_degisiklik AFTER UPDATE OR DELETE ON makine
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
