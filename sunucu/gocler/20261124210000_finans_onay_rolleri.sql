-- 3673 yetki kararları (kullanıcı, Soru Merkezi 25.11): ikinci kişi onayını Müdür ve Genel Müdür verir; eşik tutarlarını yalnız yönetici yazar
-- (finans.onay-ayar hiçbir role verilmez, yöneticide bayrakla vardır). Mevcut hiçbir işlem silinmez, yalnız ekler.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES ('mudur', 'finans.onay'), ('genel_mudur', 'finans.onay')) AS m (kod, islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
