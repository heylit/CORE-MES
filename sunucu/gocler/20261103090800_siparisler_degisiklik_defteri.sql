-- 1968 a: siparişin başlığı (termin, durum, ceza) planın teslim hedefidir; yeni sipariş satırı plana yeni iş getirir. İkisi de ekleme
-- dahil değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Planlama sayfası değişiklik akışını buradan okur (1962).
-- Oluşturan, güncelleyen, onaylayan ve zamanları satırdadır; defter kişiyi oturum değişkeninden, onayı durum geçişinden alır.
CREATE TRIGGER siparisler_siparis_degisiklik AFTER INSERT OR UPDATE OR DELETE ON siparisler_siparis
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id',
    'surum', 'olusturan_id', 'olusturma', 'guncelleyen_id', 'guncelleme', 'onaylayan_id', 'onay_zamani');

DROP TRIGGER siparisler_siparis_satiri_degisiklik ON siparisler_siparis_satiri;
CREATE TRIGGER siparisler_siparis_satiri_degisiklik AFTER INSERT OR UPDATE OR DELETE ON siparisler_siparis_satiri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
