-- Müdür rota revizyonunu onaylar (kullanıcı kararı 16.10.2026, yazılı onay): onay yalnız yöneticide kaldığı için müdür,
-- planlamanın onaya gönderdiği revizyonu sahaya indiremiyordu. Dört göz kuralı değişmez: gönderen ya da taslağı düzenleyen onaylayamaz.

-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'rota.onayla' FROM rol WHERE kod = 'mudur'
ON CONFLICT (rol_id, islem) DO NOTHING;
