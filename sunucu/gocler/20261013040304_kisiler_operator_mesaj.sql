-- Operatör de Mesaj'ı görür, okur ve yazar (kullanıcı kararı 13.10.2026 "Evet", kart #904); kurulum (`mesaj.yonet`) yalnız yöneticide kalır.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'operator'), i.islem
  FROM (VALUES ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz')) AS i (islem);
