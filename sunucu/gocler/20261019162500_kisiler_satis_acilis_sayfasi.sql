-- Satış rolü girişte Siparişler sayfasını açar (kullanıcı, 22.10.2026: siparişler sayfası satış sayfasıdır). Rolde sayfa.siparisler zaten var.
-- Elle seçilmiş açılış sayfasının üstüne yazılmaz.
UPDATE rol SET acilis_sayfasi = '/siparisler' WHERE kod = 'satis' AND acilis_sayfasi IS NULL;
