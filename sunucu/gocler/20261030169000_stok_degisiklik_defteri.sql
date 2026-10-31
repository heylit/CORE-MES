-- 1372 a: malzemenin stok ayarı (kritik seviye, varsayılan ambalaj) ve stok konumu değişiklik defterine düşer
-- (denetim modülünün ortak tetik işlevi). Miktar ayrıca stok hareketindedir; bakiye tabloları deftere bağlanmaz.
CREATE TRIGGER stok_malzeme_ayari_degisiklik AFTER UPDATE OR DELETE ON stok_malzeme_ayari
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('malzeme_id', 'surum');

CREATE TRIGGER stok_konum_degisiklik AFTER UPDATE OR DELETE ON stok_konum
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
