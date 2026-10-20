-- Malzeme tanım ve ayar işlemi planlama ve müdür rollerine verilir; bayraklı rol satırsız kullanır.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'malzemeler.tanim-yaz'),
    ('mudur', 'malzemeler.tanim-yaz')
  ) AS m (kod, islem);
