-- Operatör CNC Kurulum Motoru'nu görmez ve okumaz (kart #1454, kullanıcı kararı 1393 c+: "şimdilik hem menüden hem yetkiden kaldır
-- operatör için"; 1458 a: takım değiştirme de kalkar, ucunu yalnız bu sayfa çağırır). Rol denemesinde operatör yalnız Hazırlık sekmesini görüp emir seçemiyordu; sayfa çıkmazdı.
-- Yalnız satır siler; ekrandan önceden silinmiş satır göçü durdurmaz.
DELETE FROM rol_islemi
 WHERE rol_id = (SELECT id FROM rol WHERE kod = 'operator')
   AND islem IN ('sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla', 'cnc-kurulum.takim-degistir');
