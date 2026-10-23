-- 392 a: sipariş satırının her güncellemesi ve silinmesi eski ve yeni değeriyle değişiklik defterine düşer
-- (denetim modülünün ortak tetik işlevi). Ekleme yazılmaz: yeni satırın kaydı satırın kendisidir.
CREATE TRIGGER siparisler_siparis_satiri_degisiklik AFTER UPDATE OR DELETE ON siparisler_siparis_satiri
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
