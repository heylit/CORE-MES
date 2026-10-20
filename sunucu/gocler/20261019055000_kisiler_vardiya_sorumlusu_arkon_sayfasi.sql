-- Vardiya sorumlusu Arkon MES sayfasını da açar (kullanıcı kararı 19.10.2026, soru 128 a): vardiyanın bütününü panodan, kalite,
-- bakım ve rapor ekranlarından izler. Arkon rolü değişmez (amir, 126 a).

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'vardiya_sorumlusu'), m.islem
  FROM (VALUES ('sayfa.arkon')) AS m (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
