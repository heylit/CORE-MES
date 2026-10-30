-- 1372 a: firma kartı ve adresleri değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Açılış komutu denetim
-- kaydındadır; defter sonraki güncellemeyi ve silmeyi tutar. Sürüm, güncelleme izi ve Logo gönderim durumu her yazımda
-- ya da arka işte değişir; deftere girmez, yalnız onlar değiştiyse satır yazılmaz.
CREATE TRIGGER musteri_tedarikci_firma_degisiklik AFTER UPDATE OR DELETE ON musteri_tedarikci_firma
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'guncelleme', 'guncelleyen_id', 'logo_gonderim_durumu');

CREATE TRIGGER musteri_tedarikci_adres_degisiklik AFTER UPDATE OR DELETE ON musteri_tedarikci_adres
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'guncelleme', 'guncelleyen_id');
