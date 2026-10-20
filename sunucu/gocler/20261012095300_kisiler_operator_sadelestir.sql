-- Operatör malzeme, sevkiyat ve fabrika haritası sayfalarını görmez (kart #713, kullanıcı kararı 12.10.2026: "operatör malzeme,
-- sevkiyat, Arkon MES, fabrika haritası görmesine gerek yok; terminal ve kuyruk görsün sadece"). sayfa.arkon bu göçte kalır: üretim
-- terminali ve kuyruk verisini Arkon uçlarından alır, o uçlar bugün sayfa.arkon ister. Yalnız satır siler; ekrandan önceden silinmiş satır göçü durdurmaz.
DELETE FROM rol_islemi
 WHERE rol_id = (SELECT id FROM rol WHERE kod = 'operator')
   AND islem IN ('sayfa.atolye', 'sayfa.malzemeler', 'sayfa.sevkiyat', 'sevkiyat.oku');
