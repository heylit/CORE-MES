-- Operatör CNC Kurulum'u okur ve hazırlık adımlarını onaylar, düzenlemez (kullanıcı kararı 16.10.2026, yazılı onay).
-- Hazırlık onayı yalnız onay alanlarını yazar; tezgâh, takım ve stok kayıtları cnc-kurulum.yaz ister.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'operator'), m.islem
  FROM (VALUES ('sayfa.cnc-kurulum'), ('cnc-kurulum.oku'), ('cnc-kurulum.hazirlik-onayla')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
