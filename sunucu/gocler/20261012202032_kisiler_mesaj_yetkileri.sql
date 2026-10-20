-- Mesaj yetki satırları (kart #766; kullanıcı kararı 12.10.2026 "mesajla da herkesde açık"): yönetici ve operatör dışındaki her yerleşik
-- rol sayfayı görür, okur ve yazar. Operatör terminal ve kuyrukla kalır (kullanıcı kararı 12.10.2026, kart #713; Mesaj teslimi
-- CEKIRDEK-ISTEKLERI madde 5). Kurulum işlemi (`mesaj.yonet`) hiçbir role verilmez, yalnız bayraklı yöneticide kalır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = r.kod), i.islem
  FROM (VALUES ('mudur'), ('planlama_proje'), ('kalite'), ('cam'), ('bakim'), ('satin_alma'), ('depo'), ('sevkiyat'),
               ('insan_kaynaklari'), ('idari_isler'), ('muhasebe_finans')) AS r (kod)
 CROSS JOIN (VALUES ('sayfa.mesaj'), ('mesaj.oku'), ('mesaj.yaz')) AS i (islem);
