-- Üretim emirleri ana menüye taşındı (kart #651, kullanıcı kararı 12 Ekim): /emirler sayfasını Rota'yı gören her rol görür.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT rol_id, 'sayfa.emirler' FROM rol_islemi WHERE islem = 'sayfa.rota';
