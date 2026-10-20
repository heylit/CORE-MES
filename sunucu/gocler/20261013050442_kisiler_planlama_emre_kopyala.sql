-- Planlama emir formundan rotalı üretim emri açar (kullanıcı kararı 13.10.2026 "yetki ver", kart #915); rota yazma ve onay işlemleri verilmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'rota.emre-kopyala' FROM rol WHERE kod = 'planlama_proje';
