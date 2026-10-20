-- Müşteri ve Tedarikçi Portalı rollere açılır (kullanıcı kararı 12.10.2026, madde 1 "evet"; kart #760): satış, alış, kalite, sevkiyat
-- ve finans tarafı okur ve yazar, planlama yalnız okur. Kurulum işlemi (`portal.yonet`) yalnız bayraklı yöneticide kalır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.portal'), ('mudur', 'portal.oku'), ('mudur', 'portal.yaz'),
    ('kalite', 'sayfa.portal'), ('kalite', 'portal.oku'), ('kalite', 'portal.yaz'),
    ('satin_alma', 'sayfa.portal'), ('satin_alma', 'portal.oku'), ('satin_alma', 'portal.yaz'),
    ('sevkiyat', 'sayfa.portal'), ('sevkiyat', 'portal.oku'), ('sevkiyat', 'portal.yaz'),
    ('muhasebe_finans', 'sayfa.portal'), ('muhasebe_finans', 'portal.oku'), ('muhasebe_finans', 'portal.yaz'),
    ('planlama_proje', 'sayfa.portal'), ('planlama_proje', 'portal.oku')
  ) AS m (kod, islem);
