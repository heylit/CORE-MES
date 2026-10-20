-- Vardiya işlemleri onaylı rollere verilir; vardiya sayfasını açan satırlar roller göçünde yazıldı.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'vardiya.yaz'),
    ('mudur', 'vardiya.gecmis-yaz'),
    ('planlama_proje', 'vardiya.yaz')
  ) AS m (kod, islem);
