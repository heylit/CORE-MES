-- 1702 a (1676 b, ADR 0025 kural 9): stok bakiyesinin satır değişimi değişiklik defterine eski ve yeni değerle düşer. 1372 a'nın
-- "bakiye tabloları deftere bağlanmaz" kısmının yerine geçer. Miktarın kaynağı yine stok hareketidir; defter, bakiye satırının
-- elle ya da hareketsiz değişimini kişisiyle görünür kılar. Ekleme yazılmaz: yeni bakiye satırı her zaman bir hareketle doğar.
CREATE TRIGGER stok_bakiye_degisiklik AFTER UPDATE OR DELETE ON stok_bakiye
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
