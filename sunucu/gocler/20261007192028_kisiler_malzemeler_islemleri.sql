-- Malzeme kartı sayfası ve işlemleri onaylı rollere verilir. Tanım ve ayar işlemi hiçbir role verilmez: yalnız bayraklı rol kullanır.

-- Onaylayan role yazma da verilir: onay, kartı kaydeden uçtan geçer; yazma olmadan onay 403 alır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('planlama_proje', 'sayfa.malzemeler'),
    ('planlama_proje', 'malzemeler.yaz'),
    ('cam', 'sayfa.malzemeler'),
    ('cam', 'malzemeler.yaz'),
    ('satin_alma', 'sayfa.malzemeler'),
    ('satin_alma', 'malzemeler.yaz'),
    ('depo', 'sayfa.malzemeler'),
    ('depo', 'malzemeler.yaz'),
    ('mudur', 'sayfa.malzemeler'),
    ('mudur', 'malzemeler.yaz'),
    ('mudur', 'malzemeler.onayla'),
    ('kalite', 'sayfa.malzemeler'),
    ('kalite', 'malzemeler.yaz'),
    ('kalite', 'malzemeler.onayla'),
    ('operator', 'sayfa.malzemeler')
  ) AS m (kod, islem);
