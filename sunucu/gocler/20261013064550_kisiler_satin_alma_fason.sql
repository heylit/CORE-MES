-- Satın alma fason gidiş ve dönüşünü Dış operasyonlar sayfasından girer (kullanıcı kararı 13.10.2026, kart #958); depo, müdür ve planlama da sürdürür.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'uretim-emirleri.fason' FROM rol WHERE kod = 'satin_alma';
