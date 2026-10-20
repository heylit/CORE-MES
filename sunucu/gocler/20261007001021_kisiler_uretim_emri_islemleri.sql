-- Emir açma ve terminalde üretim işlemleri onaylı rollere verilir; sayfaları açan satırlar roller göçünde yazıldı.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'uretim-emirleri.yaz'),
    ('mudur', 'terminal.uret'),
    ('planlama_proje', 'uretim-emirleri.yaz'),
    ('operator', 'terminal.uret')
  ) AS m (kod, islem);
