-- Finans, satın alma ve depo rolleri girişte kendi modülünün panosunu açar (kullanıcı kararı 12.10.2026, kart #661).
-- Elle seçilmiş açılış sayfasının üstüne yazılmaz.
UPDATE rol SET acilis_sayfasi = m.yol
  FROM (VALUES ('muhasebe_finans', '/finans'), ('satin_alma', '/satin-alma'), ('depo', '/stok')) AS m (kod, yol)
 WHERE rol.kod = m.kod AND rol.acilis_sayfasi IS NULL;
