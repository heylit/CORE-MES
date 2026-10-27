-- Proje yönetimi işlemleri (890 c; kullanıcı kararı 910 a, 27.10.2026): müdür ve planlama (planlama_proje) görev, kilometre taşı ve statü yazar;
-- statü listesini ve serbest statü iznini yalnız müdür değiştirir. Yönetici her işlemi bayrakla taşır, satır yazılmaz. Öbür roller okur.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'projeler.gorev-yaz'), ('mudur', 'projeler.statu-yaz'), ('mudur', 'projeler.statu-ayar'),
    ('planlama_proje', 'projeler.gorev-yaz'), ('planlama_proje', 'projeler.statu-yaz')
  ) AS m (kod, islem)
 WHERE EXISTS (SELECT 1 FROM rol WHERE kod = m.kod)
ON CONFLICT (rol_id, islem) DO NOTHING;
