-- 3673-b yetki kararı (kullanıcı, Soru Merkezi 25.11): finans.ayar muhasebe_finans rolünden alınır; bilanço/bütçe ve diğer finans ayarları yalnız yöneticide kalır.
-- Yalnız rolden siler; kişiye ayrıca verilmiş finans.ayar (kisi_islemi) bu göçün konusu değildir.
DELETE FROM rol_islemi
 WHERE islem = 'finans.ayar'
   AND rol_id = (SELECT id FROM rol WHERE kod = 'muhasebe_finans');
