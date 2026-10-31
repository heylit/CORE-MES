-- 1372 a: kişi kartı değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Parola özeti defterde okurken
-- maskelense de saklanmaz: özet deftere hiç girmez. Oturumları düşürme anı ve sürüm teknik izdir; yalnız onlar
-- değiştiyse (parola değişimi, bütün oturumları kapatma) satır yazılmaz, olayın kendisi denetim kaydındadır.
CREATE TRIGGER kisi_degisiklik AFTER UPDATE OR DELETE ON kisi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'parola_ozeti', 'oturumlar_gecersiz_once', 'surum');
