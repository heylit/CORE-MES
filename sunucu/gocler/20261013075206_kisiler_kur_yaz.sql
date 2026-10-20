-- Günlük kur ve faizi muhasebe ve satın alma girer (kullanıcı kararı 13.10.2026 "Ayrı işlem ver", kart #953); satın alma finans rakamlarını görmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, 'finans.kur-yaz' FROM rol r WHERE r.kod IN ('muhasebe_finans', 'satin_alma');
