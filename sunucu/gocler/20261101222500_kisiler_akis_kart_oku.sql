-- Depo refakat kartının akışını, yerini ve lead süresini görür (kullanıcı kararı 02.11.2026, AKS-5 a, kart 1870 "b: yalnız kartın akışı").
-- akis.kart-oku yalnız refakat kartı uçlarını açar; Akış Süresi sayfası (sayfa.akis) depoya verilmez.

-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Yetkiler ekranından önceden verilmiş satır atlanır (göç orada durmaz).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'depo'), 'akis.kart-oku'
ON CONFLICT (rol_id, islem) DO NOTHING;
