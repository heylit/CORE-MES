-- Kalibrasyon kaliteye ve müdüre, istasyon yazımı ve denetim sayfası müdüre açılır (kullanıcı kararları RM2, RM3, D48m).
-- Kalibrasyon okuma uçları sayfa işlemini de kabul eder (ADR 0007): `kalibrasyon.oku` hiçbir role verilmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('kalite', 'sayfa.kalibrasyon'),
    ('kalite', 'kalibrasyon.yaz'),
    ('mudur', 'sayfa.kalibrasyon'),
    ('mudur', 'istasyonlar.yaz'),
    ('mudur', 'sayfa.denetim')
  ) AS m (kod, islem);
