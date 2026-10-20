-- Operatör üst çubuk aramasında (Ctrl K) yalnız bugün atandığı istasyonun açık emirlerini bulur (kullanıcı kararı 16.10.2026, yazılı onay).

-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT id, 'uretim-emirleri.ara-istasyon' FROM rol WHERE kod = 'operator'
ON CONFLICT (rol_id, islem) DO NOTHING;
