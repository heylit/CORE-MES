-- Varsayılan roller portalda kendi bölümünü açar (kullanıcı kararı 13.10.2026 "1-a", kart #982); planlama bölüm almaz, yalnız okur.
-- Satır elle girilmişse birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'portal.satinalma'), ('mudur', 'portal.satis'), ('mudur', 'portal.finans'), ('mudur', 'portal.kalite'),
    ('satin_alma', 'portal.satinalma'),
    ('kalite', 'portal.kalite'),
    ('muhasebe_finans', 'portal.finans'),
    ('sevkiyat', 'portal.satis')
  ) AS m (kod, islem);
